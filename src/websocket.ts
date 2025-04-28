import { GatewayOpcodes, GatewayPresenceUpdateDispatchData, GatewayRequestGuildMembersDataWithUserIds } from 'discord-api-types/v10';
import { IncomingMessage } from 'http';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { Util } from './utils/util';
import { EmbedBuilder } from './structures';
import { Logger } from './utils/logger';
import { WebsocketOpcodes, WebsocketReceivePayload, WebSocketUser, IdentifyPayload, WebSocketRequestGuildMembersPayloadData } from './@types/websocketTypes';
import { Gateway } from './gateway';
import { Info } from './utils/info';
import { RateLimiterMemory } from 'rate-limiter-flexible';

class Connection {
    private server: WebSocketServer;
    private gateway: Gateway;
    private static readonly PING_INTERVAL: number = 41250;
    private static readonly MAX_CONNECTIONS: number = 100;
    private static readonly RATE_LIMIT: number = 5;

    private rateLimiter: RateLimiterMemory;
    private allowedOrigins = new Set(process.env.ALLOWED_ORIGINS?.split(',') || []);
    private finalizationRegistry = new FinalizationRegistry((id: string) => {
        Logger.debug(`Connection ${id} garbage collected`, [Connection.name]);
    });

    private connectionPool = new Set<WeakRef<WebSocketUser>>();
    private sessionTimeouts = new Map<string, NodeJS.Timeout>();
    public sessions: Map<string, {
        sessionId: string;
        clientInfo: any;
        lastAccess: Date;
        fingerprint: string;
    }> = new Map();

    private abortControllers = new Map<string, AbortController>();
    private sendBuffers = new Map<WebsocketOpcodes | GatewayOpcodes, Buffer>();

    constructor(server: WebSocketServer, gateway: Gateway) {
        this.server = server;
        this.server.on('connection', this.onConnect.bind(this));
        this.gateway = gateway;
        this.connectionPool = new Set();
        this.rateLimiter = new RateLimiterMemory({
            points: Connection.RATE_LIMIT,
            duration: 1
        });

        this.server.options = {
            ...this.server.options,
            maxPayload: 4096,
            clientTracking: true,
            verifyClient: this.verifyClient.bind(this)
        };

        this.startZombieConnectionChecker();
    }

    private addConnection(user: WebSocketUser) {
        const ref = new WeakRef(user);

        this.connectionPool.add(ref);
        this.finalizationRegistry.register(user, user.id);

        Logger.info(`[${user.id}] - Active connections: ${this.connectionPool.size}`, [Connection.name]);
    }

    private removeConnection(user: WebSocketUser) {
        this.connectionPool.forEach(ref => {
            const connection = ref.deref();
            if (connection === user) {
                this.connectionPool.delete(ref);
                this.finalizationRegistry.unregister(user);
            }
        });

        Logger.info(`[${user.id}] - Active connections: ${this.connectionPool.size}`, [Connection.name]);
    }

    private async verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }, callback: (res: boolean, code?: number, message?: string) => void) {
        try {
            if (this.allowedOrigins.size > 0 && !this.allowedOrigins.has(info.origin)) {
                Logger.warn(`Connection attempt from unauthorized origin: ${info.origin}`, [Connection.name, this.verifyClient.name]);
                return callback(false, 403, 'Origin not allowed');
            }

            const ip = Info.getClientIp(info.req);
            try {
                await this.rateLimiter.consume(ip);
                callback(true, undefined, this.negotiateProtocolVersion(info.req));
            } catch (rateLimitError) {
                Logger.warn(`Rate limit exceeded for IP: ${ip}`, [Connection.name, this.verifyClient.name]);
                callback(false, 429, 'Too many requests');
            }
        } catch (error) {
            Logger.error(`Verify client error: ${(error as Error).message}`, [Connection.name, this.verifyClient.name]);
            callback(false, 500, 'Internal server error');
        }
    }

    private negotiateProtocolVersion(req: IncomingMessage): string {
        const versions = req.headers['sec-websocket-protocol']?.split(', ') || [];
        return versions.includes('v2') ? 'v2' : 'v1';
    }

    private async onConnect(ws: WebSocket, req: IncomingMessage) {
        if (this.connectionPool.size >= Connection.MAX_CONNECTIONS) {
            ws.close(1013, 'Server too busy');
            return;
        }

        try {
            const id = Util.generateSnowflake();
            const info = await Info.getClientInfo(req, ws);
            const user: WebSocketUser = {
                id,
                ip: info.ip,
                ws,
                isAlive: true,
                pingInterval: null,
                sequence: 0,
                sessionId: null,
                identified: false,
                user: { ids: [] },
                missedPings: 0,
                maxMissedPings: 3,
                protocol: this.negotiateProtocolVersion(req)
            };

            ws.on('message', (message) => {
                this.onMessage(user, message).catch(error =>
                    this.handleError(user, error)
                );
            });
            ws.on('close', (code) => this.onClose(user, code));
            ws.on('error', (error) => this.onError(user, error));

            this.addConnection(user);
            this.gateway.addUser(user);

            this.send(user, {
                op: WebsocketOpcodes.Hello,
                d: {
                    heartbeat_interval: Connection.PING_INTERVAL,
                    _trace: ['gateway-hello']
                }
            });

            this.startHeartbeat(user);

            const embed = new EmbedBuilder()
                .setColor(0x1ed760)
                .setTitle('Websocket Connection')
                .setDescription(Info.getClientInfoMessage(info).join('\n'))
                .setTimestamp(Date.now().toString());

            await Util.webhookLog({ embeds: [embed] });

            Logger.info(`[${user.id}] - [${user.ip}]: New connection established`, [Connection.name, this.onConnect.name]);
        } catch (error) {
            Logger.error(`Connection error: ${(error as Error).message}`, [Connection.name, this.onConnect.name]);
            ws.close(1011, 'Internal server error');
        }
    }

    private async onMessage(user: WebSocketUser, data: RawData) {
        try {
            try {
                await this.rateLimiter.consume(user.id);
            } catch (rateLimitError) {
                this.send(user, {
                    op: WebsocketOpcodes.RateLimited,
                    d: { retry_after: 1, global: false }
                });

                return;
            }

            const payload = await this.parsePayload<WebsocketReceivePayload>(data);
            if (!payload) return this.sendInvalidPayload(user);

            try {
                switch (payload.op) {
                    case WebsocketOpcodes.Identify:
                        await this.handleIdentify(user, payload.d as IdentifyPayload);
                        break;

                    case WebsocketOpcodes.Heartbeat:
                        await this.handleHeartbeat(user);
                        break;

                    case GatewayOpcodes.RequestGuildMembers:
                        await this.handleRequestGuildMembers(user, payload.d as GatewayRequestGuildMembersDataWithUserIds);
                        break;

                    case WebsocketOpcodes.Resume:
                        await this.handleResume(user, payload.d as string);
                        break;

                    case GatewayOpcodes.PresenceUpdate:
                        await this.handlePresenceUpdate(user, payload.d as GatewayPresenceUpdateDispatchData);
                        break;

                    default:
                        this.sendInvalidOpcode(user);
                        break;
                }
            } catch (opError) {
                Logger.error(`[${user.id}] Op ${payload.op} handling error: ${(opError as Error).message}`, [Connection.name, this.onMessage.name]);

                this.send(user, {
                    op: WebsocketOpcodes.Error,
                    d: { message: 'Failed to process operation' }
                });

            }
        } catch (error) {
            Logger.error(`[${user.id}] Message handling error: ${(error as Error).message}`, [Connection.name, this.onMessage.name]);
            this.destroy(user, 1011, 'Internal error');
        }
    }

    private async parsePayload<T = unknown>(data: unknown): Promise<T> {
        if (data instanceof ArrayBuffer) {
            const text = new TextDecoder('utf-8').decode(data);
            return JSON.parse(text) as T;
        }
        if (data instanceof Blob) {
            const text = await data.text();
            return JSON.parse(text) as T;
        }
        if (data instanceof Buffer) {
            const text = data.toString('utf-8');
            return JSON.parse(text) as T;
        }
        if (typeof data === 'string') {
            return JSON.parse(data) as T;
        }
        if (typeof data === 'object') {
            return data as T;
        }
        throw new Error('Unknown data type');
    }

    private async handleIdentify(user: WebSocketUser, data: IdentifyPayload) {
        if (user.identified) {
            return this.send(user, {
                op: WebsocketOpcodes.InvalidSession,
                d: false
            });
        }

        const session = this.sessions.get(data.session!) ?? null;
        const ids = data.ids ?? [];

        if (!session || ids.length === 0) {
            this.send(user, {
                op: WebsocketOpcodes.InvalidSession,
                d: false
            });

            return this.destroy(user, 4004, 'Identification failed');
        }

        const sessionId = session.sessionId;

        this.sessions.set(sessionId, {
            sessionId,
            clientInfo: { ids },
            lastAccess: new Date(),
            fingerprint: session.fingerprint
        });

        this.scheduleSessionCleanup(sessionId);

        user.identified = true;
        user.sessionId = sessionId
        user.user.ids = ids;

        this.gateway.updateUser(user);

        this.send(user, {
            op: WebsocketOpcodes.Ready,
            d: {
                session_id: user.sessionId,
                fingerprint: session.fingerprint,
                user_ids: ids,
                _trace: ['gateway-ready']
            }
        });

        Logger.info(`[${user.id}] - Identified as ${session.fingerprint} tracing [${ids?.join(', ')}]`, [Connection.name, this.handleIdentify.name]);
    }

    private async handleHeartbeat(user: WebSocketUser) {
        user.isAlive = true;
        user.missedPings = 0;

        this.send(user, {
            op: WebsocketOpcodes.HeartbeatAck,
            d: {
                timestamp: Date.now(),
                _trace: ['gateway-ack']
            }
        });

        Logger.debug(`[${user.id}] - Heartbeat acknowledged`, [Connection.name]);
    }

    private async handleResume(user: WebSocketUser, sessionId: string) {
        const session = this.sessions.get(sessionId);

        if (!session) {
            this.send(user, {
                op: WebsocketOpcodes.InvalidSession,
                d: true
            });
            return;
        }

        this.clearSessionTimeout(sessionId);

        user.sessionId = sessionId;
        user.identified = true;
        user.user.ids = session.clientInfo.ids;

        this.send(user, {
            op: WebsocketOpcodes.Resumed,
            d: {
                session_id: sessionId,
                sequence: user.sequence,
                _trace: ['gateway-resumed']
            }
        });

        this.startHeartbeat(user);

        Logger.info(`[${user.id}] - Session resumed: ${sessionId}`, [Connection.name, this.handleResume.name]);
    }

    private clearSessionTimeout(sessionId: string) {
        const timeout = this.sessionTimeouts.get(sessionId);
        if (timeout) {
            clearTimeout(timeout);
            this.sessionTimeouts.delete(sessionId);
        }
    }

    private scheduleSessionCleanup(sessionId: string) {
        this.clearSessionTimeout(sessionId);

        const timeout = setTimeout(() => {
            this.sessions.delete(sessionId);
            Logger.debug(`Session ${sessionId} cleaned up`, [Connection.name]);
        }, 60_000 * 30);

        this.sessionTimeouts.set(sessionId, timeout);
    }

    private notifyReconnectStrategy(user: WebSocketUser, action: 'reconnect' | 'resume', reason: string) {
        const basePayload = {
            reason,
            retry_after: 5000, // ms
            code: action === 'reconnect' ? 4000 : 4001,
            _trace: ['gateway-reconnect-strategy']
        };

        const opcode = action === 'reconnect'
            ? WebsocketOpcodes.ReconnectRequired
            : WebsocketOpcodes.ResumeSuggested;

        this.send(user, {
            op: opcode,
            d: basePayload
        });

        Logger.info(`[${user.id}] - Notified to ${action}. Reason: ${reason}`,
            [Connection.name, this.notifyReconnectStrategy.name]);
    }

    private handleSessionInvalidation(user: WebSocketUser, reason: string) {
        this.send(user, {
            op: WebsocketOpcodes.SessionInvalidated,
            d: {
                reason,
                may_resume: false,
                code: 4002,
                _trace: ['gateway-session-invalidation']
            }
        });

        Logger.warn(`[${user.id}] - Session invalidated. Reason: ${reason}`, [Connection.name, this.handleSessionInvalidation.name]);
    }

    private async handlePresenceUpdate(user: WebSocketUser, data: GatewayPresenceUpdateDispatchData) {
        if (!user.identified) {
            this.send(user, {
                op: WebsocketOpcodes.InvalidSession,
                d: false
            });
            return;
        }

        if (data.user.id !== user.id) {
            this.send(user, {
                op: WebsocketOpcodes.InvalidSession,
                d: false
            });
            return;
        }

        this.send(user, {
            op: GatewayOpcodes.PresenceUpdate,
            d: data
        });
    }

    private async handleRequestGuildMembers(user: WebSocketUser, data: WebSocketRequestGuildMembersPayloadData) {
        if (!user.identified) {
            this.send(user, {
                op: WebsocketOpcodes.InvalidSession,
                d: false
            });
            return;
        }

        await this.gateway.send({
            op: GatewayOpcodes.RequestGuildMembers,
            d: {
                guild_id: process.env.GUILD_ID,
                user_ids: data.user_ids,
                with_profile: true,
                presences: true,
                limit: 0
            }
        });

        Logger.info(`[${user.id}] - Requested guild members`, [Connection.name, this.handleRequestGuildMembers.name]);
    }

    private onClose(user: WebSocketUser, code: number) {
        Logger.warn(`[${user.id}] - Connection closed with code ${code}. Remaining connections: ${this.connectionPool.size}`, [Connection.name, this.onClose.name]);
        this.destroy(user, code);
    }

    private onError(user: WebSocketUser, error: Error) {
        Logger.error(`[${user.id}] - Connection error: ${error.message}`, [Connection.name, this.onError.name]);
        this.destroy(user, 1011, 'Internal error');
    }

    private startHeartbeat(user: WebSocketUser) {
        this.clearPingInterval(user);

        const sendPing = () => {
            if (user.missedPings >= user.maxMissedPings) {
                Logger.warn(`[${user.id}] - Heartbeat timeout`, [Connection.name]);
                this.destroy(user, 4009, 'Heartbeat timeout');
                return;
            }

            if (!user.isAlive) {
                user.missedPings++;
                Logger.warn(`[${user.id}] - Missed ping (${user.missedPings}/${user.maxMissedPings})`, [Connection.name]);
            }

            user.isAlive = false;

            const requestId = Util.generateSnowflake();
            const pingSentAt = Date.now();

            this.send(user, {
                op: WebsocketOpcodes.Heartbeat,
                d: {
                    sequence: user.sequence,
                    request_id: requestId,
                    timestamp: pingSentAt
                }
            });

            setTimeout(() => {
                if (!user.isAlive) {
                    Logger.warn(`[${user.id}] - No ACK for ping ${requestId}`, [Connection.name]);
                }
            }, Connection.PING_INTERVAL / 2);
        };

        sendPing();

        user.pingInterval = setInterval(sendPing, Connection.PING_INTERVAL) as unknown as NodeJS.Timeout;
    }


    private startZombieConnectionChecker() {
        setInterval(() => {
            this.connectionPool.forEach(ref => {
                const user = ref.deref();

                if (user && !user.isAlive && user.missedPings > 0) {
                    this.destroy(user, 4009, 'Zombie connection');
                }
            });
        }, Connection.PING_INTERVAL * 2);
    }

    private sendInvalidPayload(user: WebSocketUser) {
        this.send(user, {
            op: WebsocketOpcodes.InvalidPayload,
            d: { message: 'Invalid payload received' }
        });

        Logger.warn(`[${user.id}] - Invalid payload received`, [Connection.name, this.sendInvalidPayload.name]);
    }

    private sendInvalidOpcode(user: WebSocketUser) {
        this.send(user, {
            op: WebsocketOpcodes.InvalidOpcode,
            d: { message: 'Unsupported opcode received' }
        });
        Logger.warn(`[${user.id}] - Invalid opcode received`, [Connection.name, this.sendInvalidOpcode.name]);
    }

    private clearPingInterval(user: WebSocketUser) {
        if (user.pingInterval) {
            clearInterval(user.pingInterval);
            user.pingInterval = null;
        }
    }

    private removeListeners(user: WebSocketUser) {
        const events = ['message', 'close', 'error', 'pong'];
        events.forEach(event => user.ws.removeAllListeners(event));
    }

    private destroy(user: WebSocketUser, code?: number, reason?: string) {
        if (code === 4009) { // Heartbeat timeout
            this.notifyReconnectStrategy(user, 'resume', 'heartbeat_timeout');
        }
        else if (code === 1013) { // Server overload
            this.notifyReconnectStrategy(user, 'reconnect', 'server_overload');
        }
        else if (code === 4004) { // Auth failed
            this.handleSessionInvalidation(user, 'authentication_failure');
        }

        if (user.sessionId) {
            this.scheduleSessionCleanup(user.sessionId);
        }

        const controller = new AbortController();
        this.abortControllers.set(user.id, controller);

        const cleanup = () => {
            clearTimeout(timeout);
            this.clearPingInterval(user);
            this.removeListeners(user);
            this.removeConnection(user);
            this.gateway.removeUser(user.ws);
            this.abortControllers.delete(user.id);
        };

        const timeout = setTimeout(() => {
            user.ws.terminate();
            cleanup();
        }, 5000).unref();

        if (user.ws.readyState === WebSocket.OPEN) {
            user.ws.close(code, reason);
        }
        cleanup();
    }

    private send(user: WebSocketUser, payload: WebsocketReceivePayload) {
        if (user.ws.readyState !== WebSocket.OPEN) return;

        const buffer = this.sendBuffers.get(payload.op) || Buffer.from(JSON.stringify({
            ...payload,
            s: user.sequence++
        }));

        try {
            user.ws.send(buffer, { compress: true }, (error) => {
                if (error) Logger.error(`[${user.id}] - Send error: ${error.message}`, [Connection.name, this.send.name]);
            });
            Logger.info(`Data was sent to user ${user.id} on session ${user.sessionId}`, [Connection.name, this.send.name]);
        } catch (error) {
            Logger.error(`Failed to send data to user ${user.id} on session ${user.sessionId}: ${error}`, [Connection.name, this.send.name]);
        }
    }

    private handleError(user: WebSocketUser, error: Error) {
        Logger.error(`[${user.id}] ${error.message}`, [Connection.name]);
        this.destroy(user, 1011, 'Internal error');
    }
}

export { Connection };