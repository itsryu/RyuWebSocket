import WebSocket, { type Data } from 'ws';
import { ClientOptions, CloseCodes, MemberPresence, SendRateLimitState, SpotifyTrackResponse, UserProfileResponse, WebsocketOpcodes, WebsocketReceivePayload, WebSocketReceivePayloadEvents, WebSocketSendPayload, WebSocketShardDestroyOptions, WebSocketShardDestroyRecovery, WebSocketShardEvents, WebSocketShardStatus, WebSocketUser } from './@types';
import { GatewayOpcodes, GatewayDispatchEvents, Snowflake, GatewayReceivePayload, GatewayCloseCodes, GatewayRequestGuildMembersDataWithUserIds, PresenceUpdateStatus } from 'discord-api-types/v10';
import EventEmitter from 'node:events';
import { EmbedBuilder } from './structures';
import { SpotifyEvents } from './@types';
import { SpotifyGetTrackRoute } from './api/routes';
import { Logger } from './utils/logger';
import { setTimeout as sleep } from 'node:timers/promises';
import { Util } from './utils/util';
import { Client } from './client';
import axios from 'axios';

class Gateway extends EventEmitter {
    #token!: Snowflake;
    #status: WebSocketShardStatus = WebSocketShardStatus.Idle;
    private socket: WebSocket | null = null;
    private readonly options: ClientOptions;
    public connections = new Map<string, WebSocket>();
    private resume_url!: URL | null;
    private sequence!: number | null;
    private session?: string;
    private lastHeartbeatAt: number = -1;
    private isAck = true;
    private replayedEvents = 0;
    private initialHeartbeatTimeoutController: AbortController | null = null;
    private readonly timeoutAbortControllers = new Map<WebSocketShardEvents, AbortController>();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private sendRateLimitState: SendRateLimitState = Util.getInitialSendRateLimitState();
    private failedToConnectDueToNetworkError = false;
    private users: WebSocketUser[] = [];
    private connectionAttempts = 0;
    private maxConnectionAttempts = 10;
    private reconnectDelay = 1000;
    private maxReconnectDelay = 60000;
    private emitAndBroadcastQueue = new Map<string, {
        queue: Array<{
            timestamp: number;
            data: SpotifyTrackResponse | MemberPresence | GatewayRequestGuildMembersDataWithUserIds | null;
        }>;
        timeout?: NodeJS.Timeout;
        lastProcessed: number;
    }>();
    private static readonly QUEUE_TIMEOUT = 5000; // 5 seconds

    constructor(options: ClientOptions) {
        super({ captureRejections: true });

        this.options = options;
    }

    public get status(): WebSocketShardStatus {
        return this.#status;
    }

    private setToken(token: Snowflake): void {
        if (this.#token) {
            throw new Error('Token has already been set');
        }

        this.#token = token;
    }

    get token(): Snowflake {
        if (!this.#token) {
            throw new Error('Token is not set');
        }

        return this.#token;
    }

    // just handle with unpacked messages (not working at all)
    private unpackMessage(data: Data, isBinary: boolean): GatewayReceivePayload | null {
        if (!isBinary) {
            try {
                return JSON.parse(data as string) as GatewayReceivePayload;
            } catch {
                return null;
            }
        } else {
            return null;
        }
    }

    public async login(token: Snowflake): Promise<Snowflake> {
        await this.establishConnection();
        this.setToken(token);

        return token;
    }

    private async establishConnection(): Promise<void> {
        this.connectionAttempts = 0;
        this.#status = WebSocketShardStatus.Idle;

        while (this.connectionAttempts < this.maxConnectionAttempts) {
            try {
                this.socket = await this.connect(false, new URL(process.env.GATEWAY_URL));

                return;
            } catch (error) {
                Logger.error(`Connection attempt ${this.connectionAttempts} failed: ${error}`, [Gateway.name, this.establishConnection.name]);

                if (this.connectionAttempts >= this.maxConnectionAttempts) {
                    throw new Error('Max connection attempts reached');
                }

                const delay = Math.min(this.reconnectDelay * Math.pow(2, this.connectionAttempts - 1), this.maxReconnectDelay);
                await sleep(delay + Math.random() * 1000);
            } finally {
                this.connectionAttempts++;
            }
        }

        throw new Error('Failed to establish connection after multiple attempts');
    }

    // connect to gateway
    private connect(isReconnect = false, gatewayURL: URL): Promise<WebSocket | null> {
        this.socket = new WebSocket(gatewayURL);
        Logger.info((isReconnect ? 'Reconnecting' : 'Connecting') + ` to Discord Gateway (${gatewayURL}) ..`, [Gateway.name, this.connect.name]);

        return new Promise((resolve) => {
            this.socket?.on('open', async () => {
                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle(isReconnect ? 'Gateway Resume' : 'Gateway')
                    .setDescription(isReconnect
                        ? 'WebSocket connection was resumed successfully!'
                        : 'WebSocket connection was opened successfully!')
                    .setTimestamp(new Date().toISOString());

                await Util.webhookLog({ embeds: [embed] });
                resolve(this.socket);
            });

            this.socket?.on('message', this.onMessage.bind(this));
            this.socket?.on('close', async (code: number) => await this.onClose(code));
            this.socket?.on('error', (error) => this.onError(error));
        });
    };

    private async identify(token: Snowflake) {
        Logger.debug(['Waiting for identify throttle'], [Gateway.name, this.identify.name]);

        await this.send({
            op: GatewayOpcodes.Identify,
            d: {
                token: token,
                intents: this.options.intents.reduce((a, b) => a | b, 0),
                properties: {
                    os: 'linux',
                    browser: 'opera',
                    device: 'ios'
                },
                large_threshold: 250
            }
        });

        Logger.debug(['Identified with the gateway'], [Gateway.name, this.identify.name]);
    }

    private async resume(resume_url: URL, sequence: number, session: string, token: Snowflake) {
        this.debug([
            'Resuming session: ',
            `session: ${session}`,
            `resume url: ${resume_url}`,
            `sequence: ${sequence}`
        ]);

        Logger.debug([
            'Resuming session',
            `session: ${session}`,
            `resume url: ${resume_url}`,
            `sequence: ${sequence}`
        ], [Gateway.name, this.resume.name]);

        this.#status = WebSocketShardStatus.Resuming;
        this.replayedEvents = 0;

        await this.send({
            op: GatewayOpcodes.Resume,
            d: {
                token: token,
                session_id: session,
                seq: sequence
            }
        });
    }

    private async heartbeat(sequence: number, requested = false) {
        if (!this.isAck && !requested) {
            return this.destroy({ reason: 'Zombie connection', recover: WebSocketShardDestroyRecovery.Resume });
        }

        await this.send({
            op: GatewayOpcodes.Heartbeat,
            d: sequence
        });

        this.lastHeartbeatAt = Date.now();
        this.isAck = false;
    }

    private async onMessage(data: string): Promise<void> {
        const payload = this.unpackMessage(data, false);

        if (!payload) return;

        const { op, t, d, s } = payload;

        if (s !== null && s !== undefined) {
            this.sequence = s;
        }

        switch (op) {
            case GatewayOpcodes.Hello: {
                const jitter = Math.random();
                const firstWait = Math.floor(d.heartbeat_interval * jitter);

                Logger.debug(`Preparing first heartbeat of the connection with a jitter of ${jitter}, waiting ${firstWait}ms`, [Gateway.name, this.onMessage.name]);

                try {
                    const controller = new AbortController();
                    this.initialHeartbeatTimeoutController = controller;
                    await sleep(firstWait, undefined, { signal: controller.signal });
                } catch {
                    Logger.debug(['Cancelled initial heartbeat due to #destroy being called'], [Gateway.name, this.onMessage.name]);
                    return;
                } finally {
                    this.initialHeartbeatTimeoutController = null;
                }

                await this.heartbeat(this.sequence ?? 0);

                if (this.session && this.sequence != null && this.resume_url) {
                    this.resume(this.resume_url, this.sequence, this.session, this.token);
                } else {
                    this.identify(this.token);
                }

                Logger.debug([`First heartbeat sent, starting to beat every ${d.heartbeat_interval}ms`], [Gateway.name, this.onMessage.name]);
                this.heartbeatInterval = setInterval(() => this.heartbeat(this.sequence ?? 0), d.heartbeat_interval);

                break;
            };

            case GatewayOpcodes.Heartbeat: {
                if (this.sequence) await this.heartbeat(this.sequence, true);

                break;
            }

            case GatewayOpcodes.HeartbeatAck: {
                this.isAck = true;

                const ackAt = Date.now();
                const latency = ackAt - this.lastHeartbeatAt;

                Logger.debug(`Heartbeat latency: ${latency}ms`, [Gateway.name, this.onMessage.name]);

                break;
            }

            case GatewayOpcodes.Dispatch: {
                if (this.#status === WebSocketShardStatus.Resuming) {
                    this.replayedEvents++;
                }

                switch (t) {
                    // ready event
                    case GatewayDispatchEvents.Ready: {
                        this.#status = WebSocketShardStatus.Ready;

                        const { resume_gateway_url, session_id } = d;

                        const embed = new EmbedBuilder()
                            .setColor(0x1ed760)
                            .setTitle('Gateway Message')
                            .setDescription('Received ready event, connection established!')
                            .setTimestamp(new Date().toISOString());

                        await Util.webhookLog({ embeds: [embed] });

                        this.resume_url = Util.normalizeResumeUrl(resume_gateway_url);
                        this.session = session_id;

                        Logger.debug([
                            'Received ready event',
                            `session: ${this.session}`,
                            `resume url: ${this.resume_url}`
                        ], [Gateway.name, this.onMessage.name]);

                        break;
                    }

                    // resumed event
                    case GatewayDispatchEvents.Resumed: {
                        this.#status = WebSocketShardStatus.Ready;

                        Logger.debug([`Resumed and replayed ${this.replayedEvents} events`], [Gateway.name, this.onMessage.name]);

                        const embed = new EmbedBuilder()
                            .setColor(0x1ed760)
                            .setTitle('Gateway Message')
                            .setDescription('Received resumed event, connection resumed!')
                            .setTimestamp(new Date().toISOString());

                        await Util.webhookLog({ embeds: [embed] });

                        break;
                    }

                    // message create event
                    case GatewayDispatchEvents.MessageCreate: {
                        this.emit(GatewayDispatchEvents.MessageCreate, d);

                        break;
                    }

                    // guild member chunk event
                    case GatewayDispatchEvents.GuildMembersChunk: {
                        const { members, presences, guild_id } = d;

                        if (Object.keys(d).length && members.length) {
                            const userId = members[0].user?.id;

                            const data: UserProfileResponse | undefined = await axios.get((process.env.STATE == 'development' ? (process.env.LOCAL_URL + ':' + process.env.PORT) : (process.env.DOMAIN_URL)) + '/discord/user/profile/' + members[0].user?.id, {
                                method: 'GET',
                                headers: {
                                    'Authorization': 'Bearer ' + process.env.AUTH_KEY
                                }
                            })
                                .then((res) => res.data as UserProfileResponse)
                                .catch(() => undefined);

                            const member = {
                                activities: presences?.[0]?.activities || [], 
                                status: presences?.[0]?.status ?? PresenceUpdateStatus.Offline, 
                                members, 
                                guild_id, 
                                user: members[0]?.user, 
                                data
                            };
                            
                            Client.guildMemberPresenceData.update(userId, member);

                            // get track event
                            if (member.activities && member.activities.filter((activity) => activity.id === 'spotify:1').length > 0) {
                                const activity = member.activities.find((activity) => activity.id === 'spotify:1');

                                if (activity) {
                                    const track = await SpotifyGetTrackRoute.getTrack(activity.sync_id!);

                                    if (track && Object.keys(track).length) {
                                        this.emitAndBroadcastToUser(userId, SpotifyEvents.GetTrack, track);
                                    }
                                }
                            }

                            this.emitAndBroadcastToUser(userId, GatewayDispatchEvents.GuildMembersChunk, (await Client.guildMemberPresenceData.get(userId))!);
                        };

                        break;
                    }

                    // presence update event
                    case GatewayDispatchEvents.PresenceUpdate: {
                        const { user, activities, status, guild_id } = d;
                        const userId = user.id;

                        if (Object.keys(d).length) {
                            const member = { 
                                user, 
                                activities, 
                                status, 
                                guild_id 
                            };

                            Client.guildMemberPresenceData.update(userId, member);

                            // get track event
                            if (member.activities && member.activities.filter((activity) => activity.id === 'spotify:1').length > 0) {
                                const activity = member.activities?.find((activity) => activity.id === 'spotify:1');

                                if (activity) {
                                    const track = await SpotifyGetTrackRoute.getTrack(activity.sync_id!);

                                    if (track && Object.keys(track).length) {
                                        this.emitAndBroadcastToUser(userId, SpotifyEvents.GetTrack, track);
                                    }
                                }
                            }

                            this.emitAndBroadcastToUser(userId, GatewayDispatchEvents.PresenceUpdate, (await Client.guildMemberPresenceData.get(userId))!);
                        }

                        break;
                    }
                }

                break;
            }

            case GatewayOpcodes.Reconnect: {
                try {
                    await this.destroy({
                        reason: 'Told to reconnect by Discord',
                        recover: WebSocketShardDestroyRecovery.Resume
                    });

                    Logger.debug(['Received reconnect opcode, destroying connection'], [Gateway.name, this.onMessage.name]);
                } catch (error) {
                    Logger.error(`Failed to handle reconnect: ${error}`, [Gateway.name, this.onMessage.name]);
                }

                break;
            }

            case GatewayOpcodes.InvalidSession: {
                this.identify(this.token);

                const embed = new EmbedBuilder()
                    .setColor(0xffce47)
                    .setTitle('Gateway Message')
                    .setDescription('Received invalid session opcode, reconnecting..')
                    .setTimestamp(new Date().toISOString());

                await Util.webhookLog({ embeds: [embed] });

                this.debug([`Invalid session; will attempt to reconnect: ${d.toString()}`]);
                Logger.warn(`Invalid session; will attempt to reconnect: ${d.toString()}`, [Gateway.name, this.onMessage.name]);

                break;
            }
        }
    }

    private onError(error: Error) {
        this.failedToConnectDueToNetworkError = true;

        Logger.error(error.message, [Gateway.name, this.onError.name]);

        if (error.stack) {
            Logger.warn(error.stack, [Gateway.name, this.onError.name]);
        }
    }

    private onClose(code: CloseCodes | GatewayCloseCodes) {
        switch (code) {
            case CloseCodes.Normal: {
                return this.destroy({
                    code,
                    reason: 'Got disconnected by Discord',
                    recover: WebSocketShardDestroyRecovery.Reconnect
                });
            }

            case CloseCodes.Resuming: {
                break;
            }

            case GatewayCloseCodes.UnknownError: {
                Logger.debug([`An unknown error occurred: ${code}`], [Gateway.name, this.onClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Resume });
            }

            case GatewayCloseCodes.UnknownOpcode: {
                Logger.debug(['An invalid opcode was sent to Discord.'], [Gateway.name, this.onClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Resume });
            }

            case GatewayCloseCodes.DecodeError: {
                Logger.debug(['An invalid payload was sent to Discord.'], [Gateway.name, this.onClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Resume });
            }

            case GatewayCloseCodes.NotAuthenticated: {
                Logger.debug(['A request was somehow sent before the identify/resume payload.'], [Gateway.name, this.onClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Reconnect });
            }

            case GatewayCloseCodes.AuthenticationFailed: {
                return this.destroy({ code });
            }

            case GatewayCloseCodes.AlreadyAuthenticated: {
                Logger.debug(['More than one auth payload was sent.'], [Gateway.name, this.onClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Reconnect });
            }

            case GatewayCloseCodes.InvalidSeq: {
                Logger.debug(['An invalid sequence was sent.'], [Gateway.name, this.onClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Reconnect });
            }

            case GatewayCloseCodes.RateLimited: {
                Logger.debug(['The WebSocket rate limit has been hit, this should never happen'], [Gateway.name, this.onClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Reconnect });
            }

            case GatewayCloseCodes.SessionTimedOut: {
                Logger.debug(['Session timed out.'], [Gateway.name, this.onClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Resume });
            }

            case GatewayCloseCodes.InvalidShard: {
                Logger.debug([
                    'An invalid shard was sent.',
                    'This is usually caused by a bug in the library.'
                ], [Gateway.name, this.onClose.name]);
                return this.destroy({ code });
            }

            case GatewayCloseCodes.ShardingRequired: {
                Logger.debug([
                    'Sharding is required for this connection.',
                    'This is usually caused by a bug in the library.'
                ], [Gateway.name, this.onClose.name]);
                return this.destroy({ code });
            }

            case GatewayCloseCodes.InvalidAPIVersion: {
                Logger.debug([
                    'An invalid API version was sent.',
                    'This is usually caused by a bug in the library.'
                ], [Gateway.name, this.onClose.name]);
                return this.destroy({ code });
            }

            case GatewayCloseCodes.InvalidIntents: {
                Logger.debug([
                    'An invalid intent was sent.',
                    'This is usually caused by a bug in the library.'
                ], [Gateway.name, this.onClose.name]);
                return this.destroy({ code });
            }

            case GatewayCloseCodes.DisallowedIntents: {
                Logger.debug([
                    'An intent was sent that is not allowed.',
                    'This is usually caused by a bug in the library.'
                ], [Gateway.name, this.onClose.name]);
                return this.destroy({ code });
            }

            default: {
                Logger.debug([
                    `The gateway closed with an unexpected code ${code}, attempting to ${this.failedToConnectDueToNetworkError ? 'reconnect' : 'resume'
                    }.`
                ], [Gateway.name, this.onClose.name]);
                return this.destroy({
                    code,
                    recover: this.failedToConnectDueToNetworkError
                        ? WebSocketShardDestroyRecovery.Reconnect
                        : WebSocketShardDestroyRecovery.Resume
                });
            }
        }
    }

    public async destroy(options: WebSocketShardDestroyOptions = {}): Promise<void> {
        if (this.#status === WebSocketShardStatus.Idle) {
            this.debug(['Tried to destroy a shard that was idle']);
            Logger.debug(['Tried to destroy a shard that was idle'], [Gateway.name, this.destroy.name]);
            return;
        }

        options.code ??= options.recover === WebSocketShardDestroyRecovery.Resume ? CloseCodes.Resuming : CloseCodes.Normal;

        this.debug([
            'Destroying shard',
            `by reason: ${options.reason ?? 'none'}`,
            `with code: ${options.code}.`,
            `Recover: ${options.recover === undefined ? 'none' : WebSocketShardDestroyRecovery[options.recover]}`
        ]);

        Logger.debug([
            'Destroying shard',
            `by reason: ${options.reason ?? 'none'}`,
            `with code: ${options.code}.`,
            `Recover: ${options.recover === undefined ? 'none' : WebSocketShardDestroyRecovery[options.recover]}`
        ], [Gateway.name, this.destroy.name]);

        this.isAck = true;

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.initialHeartbeatTimeoutController) {
            this.initialHeartbeatTimeoutController.abort();
            this.initialHeartbeatTimeoutController = null;
        }

        this.lastHeartbeatAt = -1;

        for (const controller of this.timeoutAbortControllers.values()) {
            controller.abort();
        }
        this.timeoutAbortControllers.clear();

        this.failedToConnectDueToNetworkError = false;

        if (this.socket) {
            this.socket.removeAllListeners();

            const shouldClose = this.socket.readyState === WebSocket.OPEN;

            Logger.debug([
                'Connection status during destroy',
                `Needs closing: ${shouldClose}`,
                `Ready state: ${this.socket.readyState}`
            ], [Gateway.name, this.destroy.name]);

            if (shouldClose) {
                try {
                    await new Promise<void>((resolve) => {
                        const onClose = () => {
                            this.socket?.off('close', onClose);
                            resolve();
                        };

                        this.socket?.on('close', onClose);
                        this.socket?.close(options.code, options.reason);
                    });
                } catch (error) {
                    Logger.error(`Error while closing socket: ${error}`, [Gateway.name, this.destroy.name]);
                }
            }

            this.socket.onerror = null;
            this.socket = null;
        } else {
            Logger.debug(['Destroying a shard that has no connection'], [Gateway.name, this.destroy.name]);
        }

        switch (options.recover) {
            case WebSocketShardDestroyRecovery.Resume:
                Logger.debug('Preserving session data for resume', [Gateway.name, this.destroy.name]);
                break;

            case WebSocketShardDestroyRecovery.Reconnect:
                Logger.debug('Clearing session data for fresh reconnect', [Gateway.name, this.destroy.name]);
                this.sequence = null;
                this.session = undefined;
                this.resume_url = null;
                break;

            default:
                Logger.debug('Clearing all connection data', [Gateway.name, this.destroy.name]);
                this.sequence = null;
                this.resume_url = null;
                this.session = undefined;
                this.#token = undefined!;
                break;
        }

        this.#status = WebSocketShardStatus.Idle;

        if (options.recover !== undefined) {
            Logger.debug(`Initiating automatic ${WebSocketShardDestroyRecovery[options.recover]}...`,
                [Gateway.name, this.destroy.name]);

            try {
                if (this.token && this.resume_url && this.sequence && this.session) {
                    await this.connect(true, this.resume_url);
                } else {
                    await this.connect(false, new URL(process.env.GATEWAY_URL));
                }
            } catch (error) {
                Logger.error(`Automatic ${WebSocketShardDestroyRecovery[options.recover]} failed: ${error}`,
                    [Gateway.name, this.destroy.name]);
            }
        }
    }

    public async send(payload: WebSocketSendPayload): Promise<void> {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            Logger.warn('Socket is not open, cannot send payload', [Gateway.name, this.send.name]);
            return;
        }

        const now = Date.now();

        if (now >= this.sendRateLimitState.resetAt) {
            this.sendRateLimitState = Util.getInitialSendRateLimitState();
        }

        if (this.sendRateLimitState.sent + 1 >= 115) {
            const sleepFor = this.sendRateLimitState.resetAt - now + Math.random() * 1_500;

            this.debug([`Was about to hit the send rate limit, sleeping for ${sleepFor}ms`]);
            Logger.debug([`Was about to hit the send rate limit, sleeping for ${sleepFor}ms`], [Gateway.name, this.send.name]);

            const controller = new AbortController();

            const interrupted = await Promise.race([
                sleep(sleepFor).then(() => false)
            ]);

            if (interrupted) {
                this.debug(['Connection closed while waiting for the send rate limit to reset, re-queueing payload']);
                Logger.debug(['Connection closed while waiting for the send rate limit to reset, re-queueing payload'], [Gateway.name, this.send.name]);

                return this.send(payload);
            }

            controller.abort();
        }

        this.sendRateLimitState.sent++;
        this.socket.send(JSON.stringify(payload));
    };

    private debug(messages: [string, ...string[]]) {
        this.emit(WebSocketShardEvents.Debug, messages.join('\n\t'));
    }

    addUser(user: WebSocketUser) {
        if (!this.users.some(u => u.ws === user.ws && u.id === user.id)) {
            this.users.push(user);
        }
    }

    updateUser(user: WebSocketUser) {
        const index = this.users.findIndex(u => u.ws === user.ws && u.id === user.id);

        if (index !== -1) {
            this.users[index] = user;
        } else {
            this.addUser(user);
        }
    }

    removeUser(ws: WebSocket) {
        this.users = this.users.filter((user) => user.ws !== ws);
    }

    private async emitAndBroadcastToUser(
        userId: string,
        event: WebSocketReceivePayloadEvents,
        data: SpotifyTrackResponse | MemberPresence | GatewayRequestGuildMembersDataWithUserIds | null
    ): Promise<void> {
        const queueKey = `${userId}_${event}`;
        const now = Date.now();

        if (!this.emitAndBroadcastQueue.has(queueKey)) {
            this.emitAndBroadcastQueue.set(queueKey, {
                queue: [],
                lastProcessed: 0
            });
        }

        const queueData = this.emitAndBroadcastQueue.get(queueKey)!;

        queueData.queue.push({ timestamp: now, data });

        if (now - queueData.lastProcessed >= Gateway.QUEUE_TIMEOUT) {
            this.processQueueItems(queueKey);
            return;
        }

        if (queueData.timeout) {
            clearTimeout(queueData.timeout);
        }

        queueData.timeout = setTimeout(() => {
            this.processQueueItems(queueKey);
        }, Gateway.QUEUE_TIMEOUT - (now - queueData.lastProcessed));
    }

    private processQueueItems(queueKey: string): void {
        const queueData = this.emitAndBroadcastQueue.get(queueKey);
        if (!queueData || queueData.queue.length === 0) return;
      
        const itemsToProcess = [...queueData.queue];
        queueData.queue = [];
        queueData.lastProcessed = Date.now();
      
        const firstUnderscoreIndex = queueKey.indexOf('_');
        const userId = queueKey.substring(0, firstUnderscoreIndex);
        const event = queueKey.substring(firstUnderscoreIndex + 1) as WebSocketReceivePayloadEvents;
        const lastItem = itemsToProcess[itemsToProcess.length - 1];
        
        this.emit(event, lastItem.data);
        this.broadcastToUser(userId, event, { 
          op: GatewayOpcodes.Dispatch, 
          t: event, 
          d: lastItem.data 
        });
    
        // memory cleaning for inactive queues
        setTimeout(() => {
          if (queueData.queue.length === 0 && Date.now() - queueData.lastProcessed > 60000) {
            if (queueData.timeout) clearTimeout(queueData.timeout);
            this.emitAndBroadcastQueue.delete(queueKey);
          }
        }, 60000);
      }

    private broadcastToUser(userId: string, event: WebSocketReceivePayloadEvents, payload: WebsocketReceivePayload): void {
        const user = this.users.find(user => user.user?.ids?.includes(userId)) ?? null;

        if (!user) return;
        if (user.ws.readyState !== WebSocket.OPEN) return;

        const { op } = payload;

        const buffer = (op === WebsocketOpcodes.Dispatch || op === GatewayOpcodes.Dispatch)
            ? (() => {
                user.sequence++;
                return Buffer.from(JSON.stringify({ ...payload, s: user.sequence }));
            })()
            : Buffer.from(JSON.stringify({ ...payload }));

        try {
            user.ws.send(buffer, { compress: true }, (error) => {
                if (error) Logger.error(`[${user.id}] - Send error: ${error.message}`, [Gateway.name, this.broadcastToUser.name]);
            });
            Logger.info(`Data from ${event} event was sent to user ${user.id} on session ${user.sessionId}`, [Gateway.name, this.broadcastToUser.name]);
        } catch (error) {
            Logger.error(`Failed to send ${event} event data to user ${user.id} on session ${user.sessionId}: ${error}`, [Gateway.name, this.broadcastToUser.name]);
        }
    };
}

export {
    Gateway
};