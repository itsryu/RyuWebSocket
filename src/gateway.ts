import WebSocket, { type Data } from 'ws';
import { ClientOptions, CloseCodes, DiscordUser, ImportantGatewayOpcodes, MemberPresence, SendRateLimitState, SpotifyTrackResponse, WebsocketReceivePayload, WebSocketReceivePayloadEvents, WebSocketShardDestroyOptions, WebSocketShardDestroyRecovery, WebSocketShardEvents, WebSocketShardStatus, WebSocketUser } from './types';
import { GatewayOpcodes, GatewayDispatchEvents, Snowflake, GatewayReceivePayload, GatewaySendPayload, GatewayCloseCodes, GatewayRequestGuildMembersDataWithUserIds } from 'discord-api-types/v10';
import EventEmitter from 'node:events';
import { EmbedBuilder } from './structures';
import axios from 'axios';
import { SpotifyEvents } from './types';
import { SpotifyGetTrackController } from './api/routes';
import { Logger } from './utils/logger';
import { setTimeout as sleep } from 'node:timers/promises';
import { Util } from './utils/util';

class Gateway extends EventEmitter {
    #token!: Snowflake;
    #status: WebSocketShardStatus = WebSocketShardStatus.Idle;
    private socket: WebSocket | null = null;
    private readonly options: ClientOptions;
    private member!: MemberPresence;
    public connections = new Map<string, WebSocket>();
    private resume_url?: URL;
    private session?: string;
    private sequence?: number | null;
    private lastHeartbeatAt: number = -1;
    private isAck = true;
    private replayedEvents = 0;
    private initialHeartbeatTimeoutController: AbortController | null = null;
    private readonly timeoutAbortControllers = new Map<WebSocketShardEvents, AbortController>();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private sendRateLimitState: SendRateLimitState = Util.getInitialSendRateLimitState();
    private failedToConnectDueToNetworkError = false;
    private users: WebSocketUser[] = [];
    private gatewayGuildMemberData: Map<string, string>;
    private connectionAttempts = 0;
    private maxConnectionAttempts = 10;
    private reconnectDelay = 1000;
    private maxReconnectDelay = 60000;
    private messageQueue: GatewaySendPayload[] = [];
    private isReconnecting = false;

    constructor(options: ClientOptions, gatewayGuildMemberData: Map<string, string>) {
        super({ captureRejections: true });

        this.options = options;
        this.gatewayGuildMemberData = gatewayGuildMemberData;
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
        await this.establishConnection(token);
        this.setToken(token);
        
        return token;
    }

    private async establishConnection(token: Snowflake, resume_url?: URL, sequence?: number, session?: string): Promise<void> {
        this.connectionAttempts = 0;
        this.#status = WebSocketShardStatus.Idle;

        while (this.connectionAttempts < this.maxConnectionAttempts) {
            try {
                if (session && sequence !== undefined && resume_url) {
                    this.socket = await this.resumeConnection(resume_url, sequence, session, token);
                } else {
                    this.socket = await this.connect(token);
                }

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

        if (session && sequence) {
            await this.send({
                op: GatewayOpcodes.Resume,
                d: {
                    token: token,
                    session_id: session,
                    seq: sequence
                }
            });
        }
    }

    addUser(user: WebSocketUser) {
        this.users.push(user);
    }

    removeUser(ws: WebSocket) {
        this.users = this.users.filter((user) => user.ws !== ws);
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

    // connect to gateway
    private connect(token: Snowflake): Promise<WebSocket | null> {
        if (this.#status !== WebSocketShardStatus.Idle) {
            throw new Error("Tried to connect a shard that wasn't idle");
        }

        if (!process.env.GATEWAY_URL) {
            throw new Error('GATEWAY_URL is not defined in the environment variables');
        }

        this.socket = new WebSocket(new URL(process.env.GATEWAY_URL));

        Logger.info(`Connecting to Discord Gateway (${process.env.GATEWAY_URL}) ..`, [Gateway.name, this.connect.name]);
        this.#status = WebSocketShardStatus.Connecting;

        return new Promise((resolve) => {
            this.socket?.on('open', async () => {
                // identifying with the gateway
                await this.identify(token);

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle('Gateway')
                    .setDescription('WebSocket connection was opened successfully!')
                    .setTimestamp(new Date().toISOString());

                Logger.info("WebSocket it's on CONNECTED state.", [Gateway.name, this.connect.name]);
                await Util.webhookLog({ embeds: [embed] });

                this.connectionAttempts = 0;

                resolve(this.socket);
            });

            this.socket?.on('message', this.onMessage.bind(this, token));
            this.socket?.on('close', async (code: number) => { await this.onClose(code); });
            this.socket?.on('error', (error) => { this.onError(error); });
        });
    };

    // resume connection from gateway
    private resumeConnection(resume_url: URL, sequence: number, session: string, token: Snowflake): Promise<WebSocket | null> {
        this.socket = new WebSocket(resume_url);

        Logger.info(`Reconnecting to Discord Gateway (${resume_url})...`, [Gateway.name, this.resumeConnection.name]);

        return new Promise((resolve) => {
            this.socket?.on('open', async () => {
                // resuming connection with the gateway
                await this.resume(resume_url, sequence, session, token);
                await this.identify(token);

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle('Gateway Resume')
                    .setDescription('WebSocket connection was resumed successfully!')
                    .setTimestamp(new Date().toISOString());

                Logger.info("WebSocket it's on CONNECTED state.", [Gateway.name, this.resumeConnection.name]);
                await Util.webhookLog({ embeds: [embed] });

                this.connectionAttempts = 0;

                resolve(this.socket);
            });

            this.socket?.on('message', this.onMessage.bind(this, token));
            this.socket?.on('close', async (code: number) => { await this.onClose(code); });
            this.socket?.on('error', (error) => { this.onError(error); });
        });
    }

    private normalizeResumeUrl(url: string): URL {
        try {
            const resumeUrl = new URL(url);

            resumeUrl.protocol ||= 'wss:';
            resumeUrl.searchParams.set('v', resumeUrl.searchParams.get('v') ?? '10');
            resumeUrl.searchParams.set('encoding', resumeUrl.searchParams.get('encoding') ?? 'json');

            return resumeUrl;
        } catch {
            Logger.error(`Failed to parse resume URL: ${url}`, [Gateway.name, this.normalizeResumeUrl.name]);
            return this.resume_url!;
        }
    }

    private async onMessage(token: Snowflake, data: string): Promise<void> {
        const payload = this.unpackMessage(data, false);

        if (!payload) return;

        const { op, t, d, s } = payload;

        this.sequence = s;

        switch (op) {
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

                        this.resume_url = this.normalizeResumeUrl(resume_gateway_url);
                        this.session = session_id;

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

                        if (Object.keys(d).length && members.length && members[0].user?.id === process.env.USER_ID) {
                            const data: DiscordUser | undefined = await axios.get((process.env.STATE == 'development' ? (process.env.LOCAL_URL + ':' + process.env.PORT) : (process.env.DOMAIN_URL)) + '/discord/user/profile/' + members[0].user?.id, {
                                method: 'GET',
                                headers: {
                                    'Authorization': 'Bearer ' + process.env.AUTH_KEY
                                }
                            })
                                .then((res) => res.data as DiscordUser)
                                .catch(() => undefined);

                            this.member = { ...this.member, activities: presences?.[0].activities, data, members, guild_id, presences };

                            // get track event
                            if (this.member.activities && this.member.activities.filter((activity) => activity.id === 'spotify:1').length > 0) {
                                const activity = this.member.activities.find((activity) => activity.id === 'spotify:1');

                                if (activity) {
                                    const data = await SpotifyGetTrackController.getTrack(activity.sync_id!);

                                    if (data && Object.keys(data).length) {
                                        this.emitAndBroadcast(SpotifyEvents.GetTrack, data);
                                    }
                                }
                            }

                            this.emitAndBroadcast(GatewayDispatchEvents.GuildMembersChunk, this.member);
                        };

                        break;
                    }

                    // presence update event
                    case GatewayDispatchEvents.PresenceUpdate: {
                        const { user, activities, status, guild_id } = d;

                        if (Object.keys(d).length && user.id === process.env.USER_ID) {
                            this.member = { ...this.member, user, activities, status, guild_id };

                            // get track event
                            if (this.member.activities && this.member.activities.filter((activity) => activity.id === 'spotify:1').length > 0) {
                                const activity = this.member.activities.find((activity) => activity.id === 'spotify:1');

                                if (activity) {
                                    const data = await SpotifyGetTrackController.getTrack(activity.sync_id!);

                                    if (data && Object.keys(data).length) {
                                        this.emitAndBroadcast(SpotifyEvents.GetTrack, data);
                                    }
                                }
                            }

                            this.emitAndBroadcast(GatewayDispatchEvents.PresenceUpdate, this.member);
                        }

                        break;
                    }
                }

                break;
            }

            case GatewayOpcodes.Heartbeat: {
                if (this.sequence) await this.heartbeat(this.sequence, true);

                break;
            }

            case GatewayOpcodes.HeartbeatAck: {
                this.isAck = true;

                const ackAt = Date.now();
                const latency = ackAt - this.lastHeartbeatAt;

                this.emit(WebSocketShardEvents.HeartbeatComplete, {
                    ackAt,
                    heartbeatAt: this.lastHeartbeatAt,
                    latency: latency
                });

                Logger.debug(`Heartbeat latency: ${latency}ms`, [Gateway.name, this.onMessage.name]);

                break;
            }

            case GatewayOpcodes.Reconnect: {
                try {
                    await this.destroy({
                        reason: 'Told to reconnect by Discord',
                        recover: WebSocketShardDestroyRecovery.Resume
                    });

                    Logger.debug(['Received reconnect opcode, destroying connection'], [Gateway.name, this.onMessage.name]);

                    await this.handleReconnect(token, this.resume_url, s ?? 0, this.session);
                } catch (error) {
                    Logger.error(`Failed to handle reconnect: ${error}`, [Gateway.name, this.onMessage.name]);
                }

                break;
            }

            case GatewayOpcodes.Hello: {
                this.emit(WebSocketShardEvents.Hello);

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

                Logger.debug([`First heartbeat sent, starting to beat every ${d.heartbeat_interval}ms`], [Gateway.name, this.onMessage.name]);
                this.heartbeatInterval = setInterval(() => this.heartbeat(this.sequence ?? 0), d.heartbeat_interval);

                break;
            };

            case GatewayOpcodes.InvalidSession: {
                const embed = new EmbedBuilder()
                    .setColor(0xffce47)
                    .setTitle('Gateway Message')
                    .setDescription('Received invalid session opcode, reconnecting..')
                    .setTimestamp(new Date().toISOString());

                await Util.webhookLog({ embeds: [embed] });

                this.debug([`Invalid session; will attempt to resume: ${d.toString()}`]);
                Logger.warn(`Invalid session; will attempt to resume: ${d.toString()}`, [Gateway.name, this.onMessage.name]);

                await this.handleInvalidSession(d, token);
                
                break;
            }
        }
    }

    private async handleInvalidSession(resumable: boolean, token: Snowflake): Promise<void> {
        Logger.warn(`Invalid session; resumable: ${resumable}`, [Gateway.name, this.handleInvalidSession.name]);
        
        if (!resumable) {
            this.session = undefined;
            this.sequence = undefined;
            this.resume_url = undefined;
        }
    
        const delay = Math.floor(Math.random() * 4000) + 1000;
        await sleep(delay);
    
        if (resumable && this.session && this.sequence !== undefined && this.resume_url) {
            await this.establishConnection(token);
        } else {
            await this.destroy({
                reason: 'Invalid session (non-resumable)',
                recover: WebSocketShardDestroyRecovery.Reconnect
            });
            
            await this.connect(token);
        }
    }

    private onError(error: Error) {
        this.emit(WebSocketShardEvents.Error, error);

        this.failedToConnectDueToNetworkError = true;

        Logger.error(error.message, [Gateway.name, this.onError.name]);

        if (error.stack) {
            Logger.warn(error.stack, [Gateway.name, this.onError.name]);
        }
    }

    private onClose(code: CloseCodes | GatewayCloseCodes) {
        this.emit(WebSocketShardEvents.Closed, code);

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
                this.emit(
                    WebSocketShardEvents.Error,

                    new Error('Authentication failed')
                );
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
                this.emit(WebSocketShardEvents.Error, new Error('Invalid shard'));
                return this.destroy({ code });
            }

            case GatewayCloseCodes.ShardingRequired: {
                this.emit(
                    WebSocketShardEvents.Error,

                    new Error('Sharding is required')
                );
                return this.destroy({ code });
            }

            case GatewayCloseCodes.InvalidAPIVersion: {
                this.emit(
                    WebSocketShardEvents.Error,

                    new Error('Used an invalid API version')
                );
                return this.destroy({ code });
            }

            case GatewayCloseCodes.InvalidIntents: {
                this.emit(
                    WebSocketShardEvents.Error,

                    new Error('Used invalid intents')
                );
                return this.destroy({ code });
            }

            case GatewayCloseCodes.DisallowedIntents: {
                this.emit(
                    WebSocketShardEvents.Error,

                    new Error('Used disallowed intents')
                );
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

    public async destroy(options: WebSocketShardDestroyOptions = {}) {
        if (this.#status === WebSocketShardStatus.Idle) {
            this.debug(['Tried to destroy a shard that was idle']);
            Logger.debug(['Tried to destroy a shard that was idle'], [Gateway.name, this.destroy.name]);
            return;
        }

        if (options.recover !== WebSocketShardDestroyRecovery.Resume) {
            this.session = undefined;
            this.sequence = undefined;
            this.resume_url = undefined;
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

        // RESET STATE
        this.isAck = true;

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
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
                let outerResolve: () => void;

                const promise = new Promise<void>((resolve) => {
                    outerResolve = resolve;
                });

                this.socket.onclose = outerResolve!;
                this.socket.close(options.code, options.reason);

                await promise;

                this.emit(WebSocketShardEvents.Closed, options.code);
            }

            this.socket.onerror = null;
        } else {
            Logger.debug(['Destroying a shard that has no connection; please open an issue on GitHub'], [Gateway.name, this.destroy.name]);
        }


        this.#status = WebSocketShardStatus.Idle;
    }

    private async handleReconnect(token: Snowflake, resume_url?: URL, sequence?: number, session?: string): Promise<void> {
        if (this.isReconnecting) return;

        this.isReconnecting = true;
        this.#status = WebSocketShardStatus.Connecting;

        try {
            await this.establishConnection(token, resume_url, sequence, session);

            while (this.messageQueue.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
                const message = this.messageQueue.shift();

                if (message) {
                    try {
                        await this.send(message);
                    } catch (error) {
                        Logger.error(`Failed to send queued message: ${error}`, [Gateway.name, this.handleReconnect.name]);
                        this.messageQueue.unshift(message);
                        break;
                    }
                }
            }
        } catch (error) {
            Logger.error(`Reconnection failed: ${error}`, [Gateway.name, this.handleReconnect.name]);
            await sleep(this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay));
            await this.handleReconnect(token);
        } finally {
            this.isReconnecting = false;
        }
    }

    public async send(payload: GatewaySendPayload): Promise<void> {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            if (ImportantGatewayOpcodes.has(payload.op)) {
                if (!this.isReconnecting) {
                    await this.handleReconnect(this.token);
                }

                this.messageQueue.push(payload);
                return;
            }
            throw new Error("WebSocketShard wasn't connected or not opened");
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

    private emitAndBroadcast(event: WebSocketReceivePayloadEvents, data: SpotifyTrackResponse | MemberPresence | GatewayRequestGuildMembersDataWithUserIds | null): void {
        this.emit(event, data);
        this.broadcastToUsers({ op: GatewayOpcodes.Dispatch, t: event, d: data });
    }

    private broadcastToUsers(payload: WebsocketReceivePayload): void {
        const data = Util.payloadData(payload);

        this.users.forEach(user => {
            if (user.ws.readyState !== WebSocket.OPEN) {
                Logger.warn(`WS not open for user ${user.id}`, [Gateway.name, this.broadcastToUsers.name]);
                return;
            }

            try {
                user.ws.send(data);
                this.gatewayGuildMemberData.set(user.id, data);
                Logger.info(`Data sent to user ${user.id}`, [Gateway.name, this.broadcastToUsers.name]);
            } catch (error) {
                Logger.error(`Failed to send to user ${user.id}: ${error}`, [Gateway.name, this.broadcastToUsers.name]);
            }
        });
    }

    // public simulateGatewayReconnect(): void {
    //     if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
    //         Logger.warn('No active connection to request reconnect', [Gateway.name, this.simulateGatewayReconnect.name]);
    //         return;
    //     }
    
    //     Logger.warn('Simulating gateway reconnect request...', [Gateway.name, this.simulateGatewayReconnect.name]);

    //     this.socket.emit('message', (JSON.stringify({
    //         op: GatewayOpcodes.Reconnect,
    //         d: null
    //     })));
    // }
}

export {
    Gateway
};