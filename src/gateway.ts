import WebSocket, { Server, type Data } from 'ws';
import { ClientOptions, CloseCodes, DiscordUser, ImportantGatewayOpcodes, MemberPresence, SendRateLimitState, WebSocketShardDestroyOptions, WebSocketShardDestroyRecovery, WebSocketShardEvents, WebSocketShardStatus } from './types';
import { GatewayOpcodes, GatewayDispatchEvents, Snowflake, GatewayReceivePayload, GatewaySendPayload, GatewayRequestGuildMembersDataWithUserIds, RESTPostAPIWebhookWithTokenJSONBody, GatewayPresenceUpdateDispatchData, GatewayGuildMembersChunkDispatchData, GatewayReadyDispatchData, GatewayDispatchPayload, GatewayMessageCreateDispatchData, GatewayCloseCodes } from 'discord-api-types/v10';
import EventEmitter from 'node:events';
import { IncomingMessage } from 'node:http';
import { EmbedBuilder } from './structures';
import axios from 'axios';
import { SpotifyEvents, SpotifyTrackResponse } from './types';
import { SpotifyGetTrackController } from './api/routes';
import { Logger } from './utils/logger';
import { setTimeout as sleep } from 'node:timers/promises';
import { Util } from './utils/util';

class Gateway {
    #token!: Snowflake;
    #status: WebSocketShardStatus = WebSocketShardStatus.Idle;
    private wss!: Server;
    private socket!: WebSocket | null;
    public event: EventEmitter = new EventEmitter();
    private readonly options: ClientOptions;
    private member!: MemberPresence;
    public connections = new Map<string, WebSocket>();
    private resume_url?: string;
    private session?: string;
    private sequence?: number | null;
    private lastHeartbeatAt: number = -1;
    private isAck = true;
    private replayedEvents = 0;
    private initialHeartbeatTimeoutController: AbortController | null = null;
    private readonly timeoutAbortControllers = new Map<WebSocketShardEvents, AbortController>();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private sendRateLimitState: SendRateLimitState = Util.getInitialSendRateLimitState();

    // Indicates if we failed to connect to the ws url
    private failedToConnectDueToNetworkError = false;

    public constructor(options: ClientOptions, websocketServer: Server) {
        this.options = options;
        this.wss = websocketServer;
    }

    public get status(): WebSocketShardStatus {
        return this.#status;
    }

    public setToken(token: Snowflake): void {
        if (this.#token) {
            throw new Error('Token has already been set');
        }

        this.#token = token;
    }

    // just handle with unpacked messages
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
        return token;
    }

    private async establishConnection(token: Snowflake): Promise<void> {
        if (this.session && this.sequence != undefined) {
            this.socket = await this.resumeConnection(token);
        } else {
            this.socket = await this.connect(token);
        }
    }

    private async identify(token: Snowflake) {
        Logger.debug('Waiting for identify throttle', [Gateway.name, this.identify.name]);

        await this.send({
            op: GatewayOpcodes.Identify,
            d: {
                token: token,
                intents: this.options.intents.reduce((a, b) => a | b, 0),
                properties: {
                    os: 'linux',
                    browser: 'discord.ts',
                    device: 'discord.ts'
                },
                large_threshold: 250
            }
        });
    }

    private async resume(token: Snowflake) {
        if (this.session && this.sequence) {
            await this.send({
                op: GatewayOpcodes.Resume,
                d: {
                    token: token,
                    session_id: this.session,
                    seq: this.sequence
                }
            });
        }
    }

    private async heartbeat(sequence: number | null, requested = false) {
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

        this.socket = new WebSocket(process.env.GATEWAY_URL);

        Logger.info('Connecting to Discord Gateway...', [Gateway.name, this.connect.name]);
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
                await this.webhookLog({ embeds: [embed] });

                resolve(this.socket);
            });

            this.socket?.on('message', this.handleMessage.bind(this, token));
            this.socket?.on('close', async (code: number) => await this.handleClose(code));
            this.socket?.on('error', (error) => this.handleError(error));

            this.wss.on('connection', this.handleConnection.bind(this));
        });
    };

    // resume connection from gateway
    private resumeConnection(token: Snowflake): Promise<WebSocket | null> {
        this.socket = new WebSocket(`${this.resume_url}?v=10&encoding=json`);

        Logger.info('Reconnecting to Discord Gateway...', 'Gateway Resume');

        return new Promise((resolve) => {
            this.socket?.on('open', async () => {
                // resuming connection with the gateway
                await this.resume(token);

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle('Gateway Resume')
                    .setDescription('WebSocket connection was resumed successfully!')
                    .setTimestamp(new Date().toISOString());

                Logger.info("WebSocket it's on CONNECTED state.", 'Gateway Resume');
                await this.webhookLog({ embeds: [embed] });

                resolve(this.socket);
            });

            this.socket?.on('message', this.handleMessage.bind(this, token));
            this.socket?.on('close', async (code: number) => await this.handleClose(code));
            this.socket?.on('error', (error) => this.handleError(error));

            this.wss.on('connection', this.handleConnection.bind(this));
        });
    }

    private async handleMessage(token: Snowflake, data: string): Promise<void> {
        const payload = this.unpackMessage(data, false);

        if (!payload) return;

        const { op, t, d, s } = payload;

        if (op === GatewayOpcodes.Heartbeat) {
            await this.heartbeat(s, true);
        }

        if (op === GatewayOpcodes.HeartbeatAck) {
            this.isAck = true;

            const ackAt = Date.now();
            const latency = ackAt - this.lastHeartbeatAt;

            this.event.emit(WebSocketShardEvents.HeartbeatComplete, {
                ackAt,
                heartbeatAt: this.lastHeartbeatAt,
                latency: latency
            });

            Logger.debug(`Heartbeat latency: ${latency}ms`, [Gateway.name, this.handleMessage.name]);
        }

        if (op === GatewayOpcodes.Reconnect) {
            await this.destroy({
                reason: 'Told to reconnect by Discord',
                recover: WebSocketShardDestroyRecovery.Resume
            });
        }

        if (op === GatewayOpcodes.Hello) {
            this.event.emit(WebSocketShardEvents.Hello);
            const jitter = Math.random();
            const firstWait = Math.floor(d.heartbeat_interval * jitter);

            Logger.debug(`Preparing first heartbeat of the connection with a jitter of ${jitter}, waiting ${firstWait}ms`, 'Gateway Message');

            try {
                const controller = new AbortController();
                this.initialHeartbeatTimeoutController = controller;
                await sleep(firstWait, undefined, { signal: controller.signal });
            } catch {
                Logger.debug(['Cancelled initial heartbeat due to #destroy being called'], [Gateway.name, this.handleMessage.name]);
                return;
            } finally {
                this.initialHeartbeatTimeoutController = null;
            }

            await this.heartbeat(s);

            Logger.debug([`First heartbeat sent, starting to beat every ${d.heartbeat_interval}ms`], 'Gateway Message');
            this.heartbeatInterval = setInterval(() => this.heartbeat(s), d.heartbeat_interval);
        };

        if (op === GatewayOpcodes.Reconnect) {
            const embed = new EmbedBuilder()
                .setColor(0xffce47)
                .setTitle('Gateway Message')
                .setDescription('Received reconnect opcode, reconnecting..')
                .setTimestamp(new Date().toISOString());

            await this.webhookLog({ embeds: [embed] });
            Logger.warn('Received reconnect opcode, reconnecting..', 'Gateway Message');
            this.socket?.close();
            await this.establishConnection(token);
        }

        if (op === GatewayOpcodes.InvalidSession) {
            const embed = new EmbedBuilder()
                .setColor(0xffce47)
                .setTitle('Gateway Message')
                .setDescription('Received invalid session opcode, reconnecting..')
                .setTimestamp(new Date().toISOString());

            await this.webhookLog({ embeds: [embed] });
            Logger.warn('Received invalid session opcode, reconnecting..', 'Gateway Message');

            this.socket?.close();
            await this.establishConnection(token);
        }

        // handling events:
        if (op === GatewayOpcodes.Dispatch && t) {
            if (this.#status === WebSocketShardStatus.Resuming) {
                this.replayedEvents++;
            }

            if ([GatewayDispatchEvents.Ready].includes(t)) {
                this.#status = WebSocketShardStatus.Ready;

                const { resume_gateway_url, session_id } = d as GatewayReadyDispatchData;

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle('Gateway Message')
                    .setDescription('Received ready event, connection established!')
                    .setTimestamp(new Date().toISOString());

                await this.webhookLog({ embeds: [embed] });

                this.resume_url = resume_gateway_url;
                this.session = session_id;
            }

            if ([GatewayDispatchEvents.Resumed].includes(t)) {
                this.#status = WebSocketShardStatus.Ready;

                Logger.debug([`Resumed and replayed ${this.replayedEvents} events`], 'Gateway Message');

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle('Gateway Message')
                    .setDescription('Received resumed event, connection resumed!')
                    .setTimestamp(new Date().toISOString());

                await this.webhookLog({ embeds: [embed] });
            }

            if ([GatewayDispatchEvents.MessageCreate].includes(t)) {
                this.event.emit(GatewayDispatchEvents.MessageCreate, d as GatewayMessageCreateDispatchData);
            }

            // guild member chunk event
            if ([GatewayDispatchEvents.GuildMembersChunk].includes(t)) {
                const { members, presences, guild_id } = d as GatewayGuildMembersChunkDispatchData;

                if (Object.keys(d).length && members.length && members[0].user?.id === process.env.USER_ID) {
                    const data: DiscordUser | undefined = await axios.get((process.env.STATE === 'development' ? (process.env.LOCAL_URL + ':' + process.env.PORT) : (process.env.DOMAIN_URL)) + '/discord/user/' + members[0].user?.id, {
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

                        if (activity && activity.sync_id) {
                            const data = await SpotifyGetTrackController.getTrack(activity.sync_id);

                            if (data && Object.keys(data).length) {
                                this.event.emit(SpotifyEvents.GetTrack, data);
                            }
                        }
                    }

                    this.event.emit(GatewayDispatchEvents.GuildMembersChunk, this.member);
                };
            }

            // presence update event
            if ([GatewayDispatchEvents.PresenceUpdate].includes(t)) {
                const { user, activities, status, guild_id } = d as GatewayPresenceUpdateDispatchData;

                if (Object.keys(d).length && user.id === process.env.USER_ID) {
                    this.member = { ...this.member, user, activities, status, guild_id };

                    // get track event
                    if (this.member.activities && this.member.activities.filter((activity) => activity.id === 'spotify:1').length > 0) {
                        const activity = this.member.activities.find((activity) => activity.id === 'spotify:1');

                        if (activity && activity.sync_id) {
                            const data = await SpotifyGetTrackController.getTrack(activity.sync_id);

                            if (data && Object.keys(data).length) {
                                this.event.emit(SpotifyEvents.GetTrack, data);
                            }
                        }
                    }

                    this.event.emit(GatewayDispatchEvents.PresenceUpdate, this.member);
                }
            }
        }

        this.sequence = s;
    }

    private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
        const id = Math.random().toString(36).substring(7);

        this.connections.set(id, ws);

        const connection = this.connections.get(id);

        if (connection) {
            const ip = req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? req.connection.remoteAddress;
            const interval = 41250;

            setInterval(() => { connection.send(this.payloadData({ op: GatewayOpcodes.Heartbeat, d: { heartbeat_interval: interval } })); }, interval);

            const presenceUpdateHandler = (data: GatewayDispatchPayload) => { connection.send(this.payloadData({ op: GatewayOpcodes.Dispatch, t: GatewayDispatchEvents.PresenceUpdate, d: data })); };
            const guildMembersChunkHandler = (data: GatewayDispatchPayload) => { connection.send(this.payloadData({ op: GatewayOpcodes.Dispatch, t: GatewayDispatchEvents.GuildMembersChunk, d: data })); };
            const spotifyTrackHandler = (data: SpotifyTrackResponse) => { connection.send(this.payloadData({ op: GatewayOpcodes.Dispatch, t: SpotifyEvents.GetTrack, d: data })); };

            this.event.on(GatewayDispatchEvents.PresenceUpdate, presenceUpdateHandler);
            this.event.on(GatewayDispatchEvents.GuildMembersChunk, guildMembersChunkHandler);
            this.event.on(SpotifyEvents.GetTrack, spotifyTrackHandler);

            const pingInterval = setInterval(() => {
                connection?.readyState === WebSocket.OPEN ? connection.ping() : clearInterval(pingInterval);
            }, interval);

            connection.on('message', async (data: string) => {
                const buffer = Buffer.from(data, 'hex');
                const str = buffer.toString('utf8');
                const { op, d } = JSON.parse(str) as GatewaySendPayload;

                switch (op) {
                    case GatewayOpcodes.Heartbeat: {
                        connection?.ping();
                        connection?.send(this.payloadData({ op: GatewayOpcodes.Heartbeat }));
                        break;
                    };

                    case GatewayOpcodes.RequestGuildMembers: {
                        const { user_ids } = d as GatewayRequestGuildMembersDataWithUserIds;

                        await this.send({
                            op: GatewayOpcodes.RequestGuildMembers,
                            d: {
                                guild_id: process.env.GUILD_ID,
                                user_ids: user_ids,
                                presences: true,
                                limit: 0
                            }
                        });

                        const embed = new EmbedBuilder()
                            .setColor(0x1ed760)
                            .setTitle(`[${id}] - Connection request!`)
                            .setDescription(`[${id}] - [${ip}]: requested a guild member.`)
                            .setTimestamp(new Date().toISOString());

                        await this.webhookLog({ embeds: [embed] });
                        Logger.info(`[${id}] - [${ip}]: requested a guild member.`, 'Connection');
                        break;
                    }

                    default: {
                        connection?.send(this.payloadData({ op: null, t: null, d: null }));
                        break;
                    }
                }
            });

            connection?.on('pong', () => {
                Logger.info(`[${id}] - [${ip}]: pong received from connection!`, 'Connection');
            });

            connection?.on('close', async (code: number) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle(`[${id}] - Connection closed!`)
                    .setDescription(`[${id}] - [${ip}]: was disconnected by code: ${code}.`)
                    .setFooter({ text: `Connections: ${this.connections.size}` })
                    .setTimestamp(new Date().toISOString());

                await this.webhookLog({ embeds: [embed] });
                Logger.warn(`[${id}] - [${ip}]: was disconnected by code: ${code}.`, 'Connection');
                Logger.info(`${this.connections.size} connections opened.`, 'Connection');

                connection?.close();
                this.connections.delete(id);
                clearInterval(pingInterval);

                this.event.removeListener(GatewayDispatchEvents.PresenceUpdate, presenceUpdateHandler);
                this.event.removeListener(GatewayDispatchEvents.GuildMembersChunk, guildMembersChunkHandler);
                this.event.removeListener(SpotifyEvents.GetTrack, spotifyTrackHandler);
            });

            connection?.on('error', async (error) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle(`[${id}] - Connection error!`)
                    .setDescription(`[${id}] - [${ip}]: was disconnected by error: ${error.message}.`)
                    .setFooter({ text: `Connections: ${this.connections.size}` })
                    .setTimestamp(new Date().toISOString());

                await this.webhookLog({ embeds: [embed] });
                Logger.error(`[${id}] - [${ip}]: was disconnected by error: ${error.message}.`, 'Connection');
                Logger.info(`${this.connections.size} connections opened.`, 'Connection');
                Logger.warn(error.stack, 'Connection');

                connection?.close();
                this.connections.delete(id);
                clearInterval(pingInterval);

                this.event.removeListener(GatewayDispatchEvents.PresenceUpdate, presenceUpdateHandler);
                this.event.removeListener(GatewayDispatchEvents.GuildMembersChunk, guildMembersChunkHandler);
                this.event.removeListener(SpotifyEvents.GetTrack, spotifyTrackHandler);
            });

            const embed = new EmbedBuilder()
                .setColor(0x1ed760)
                .setTitle(`[${id}] - New Connection`)
                .setURL(`https://tools.keycdn.com/geo?host=${ip}`)
                .setDescription(`[${id}] - [${ip}]: connected successfully to websocket.`)
                .setFooter({ text: `Connections: ${this.connections.size}` })
                .setTimestamp(new Date().toISOString());

            await this.webhookLog({ embeds: [embed] });
            Logger.info(`[${id}] - [${ip}]: was connected successfully.`, 'Connection');
            Logger.info('A new connection was opened.', 'Connection');
            Logger.info(`${this.connections.size} connections opened.`, 'Connection');
        }
    }

    private handleError(error: Error) {
        this.event.emit(WebSocketShardEvents.Error, error);

        this.failedToConnectDueToNetworkError = true;

        Logger.error(error.message, [Gateway.name, this.handleError.name]);
        Logger.warn(error.stack, [Gateway.name, this.handleError.name]);
    }

    private handleClose(code: CloseCodes | GatewayCloseCodes) {
        this.event.emit(WebSocketShardEvents.Closed, code);

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
                Logger.debug([`An unknown error occurred: ${code}`], [Gateway.name, this.handleClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Resume });
            }

            case GatewayCloseCodes.UnknownOpcode: {
                Logger.debug(['An invalid opcode was sent to Discord.'], [Gateway.name, this.handleClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Resume });
            }

            case GatewayCloseCodes.DecodeError: {
                Logger.debug(['An invalid payload was sent to Discord.'], [Gateway.name, this.handleClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Resume });
            }

            case GatewayCloseCodes.NotAuthenticated: {
                Logger.debug(['A request was somehow sent before the identify/resume payload.'], [Gateway.name, this.handleClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Reconnect });
            }

            case GatewayCloseCodes.AuthenticationFailed: {
                this.event.emit(
                    WebSocketShardEvents.Error,

                    new Error('Authentication failed')
                );
                return this.destroy({ code });
            }

            case GatewayCloseCodes.AlreadyAuthenticated: {
                Logger.debug(['More than one auth payload was sent.'], [Gateway.name, this.handleClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Reconnect });
            }

            case GatewayCloseCodes.InvalidSeq: {
                Logger.debug(['An invalid sequence was sent.'], [Gateway.name, this.handleClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Reconnect });
            }

            case GatewayCloseCodes.RateLimited: {
                Logger.debug(['The WebSocket rate limit has been hit, this should never happen'], [Gateway.name, this.handleClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Reconnect });
            }

            case GatewayCloseCodes.SessionTimedOut: {
                Logger.debug(['Session timed out.'], [Gateway.name, this.handleClose.name]);
                return this.destroy({ code, recover: WebSocketShardDestroyRecovery.Resume });
            }

            case GatewayCloseCodes.InvalidShard: {
                this.event.emit(WebSocketShardEvents.Error, new Error('Invalid shard'));
                return this.destroy({ code });
            }

            case GatewayCloseCodes.ShardingRequired: {
                this.event.emit(
                    WebSocketShardEvents.Error,

                    new Error('Sharding is required')
                );
                return this.destroy({ code });
            }

            case GatewayCloseCodes.InvalidAPIVersion: {
                this.event.emit(
                    WebSocketShardEvents.Error,

                    new Error('Used an invalid API version')
                );
                return this.destroy({ code });
            }

            case GatewayCloseCodes.InvalidIntents: {
                this.event.emit(
                    WebSocketShardEvents.Error,

                    new Error('Used invalid intents')
                );
                return this.destroy({ code });
            }

            case GatewayCloseCodes.DisallowedIntents: {
                this.event.emit(
                    WebSocketShardEvents.Error,

                    new Error('Used disallowed intents')
                );
                return this.destroy({ code });
            }

            default: {
                Logger.debug([
                    `The gateway closed with an unexpected code ${code}, attempting to ${this.failedToConnectDueToNetworkError ? 'reconnect' : 'resume'
                    }.`
                ], [Gateway.name, this.handleClose.name]);
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

        if (!options.code) {
            options.code = options.recover === WebSocketShardDestroyRecovery.Resume ? CloseCodes.Resuming : CloseCodes.Normal;
        }

        Logger.debug([
            'Destroying shard',
            `by reason: ${options.reason ?? 'none'}`,
            `with code: ${options.code}.`,
            `Recover: ${options.recover === undefined ? 'none' : WebSocketShardDestroyRecovery[options.recover]!}`,
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
            // No longer need to listen to messages
            this.socket.onmessage = null;
            // Prevent a reconnection loop by unbinding the main close event
            this.socket.onclose = null;

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

                this.event.emit(WebSocketShardEvents.Closed, options.code);
            }

            // Lastly, remove the error event.
            // Doing this earlier would cause a hard crash in case an error event fired on our `close` call
            this.socket.onerror = null;
        } else {
            Logger.debug(['Destroying a shard that has no connection; please open an issue on GitHub'], [Gateway.name, this.destroy.name]);
        }


        this.#status = WebSocketShardStatus.Idle;
    }

    private async send(payload: GatewaySendPayload): Promise<void> {
        if (!this.socket) {
            throw new Error("WebSocketShard wasn't connected");
        }

        if (ImportantGatewayOpcodes.has(payload.op)) {
            this.socket.send(JSON.stringify(payload));
            return;
        }

        const now = Date.now();
        if (now >= this.sendRateLimitState.resetAt) {
            this.sendRateLimitState = Util.getInitialSendRateLimitState();
        }

        if (this.sendRateLimitState.sent + 1 >= 115) {
            // Sprinkle in a little randomness just in case.
            const sleepFor = this.sendRateLimitState.resetAt - now + Math.random() * 1_500;

            this.debug([`Was about to hit the send rate limit, sleeping for ${sleepFor}ms`]);
            const controller = new AbortController();

            // Sleep for the remaining time, but if the connection closes in the meantime, we shouldn't wait the remainder to avoid blocking the new conn
            const interrupted = await Promise.race([
                sleep(sleepFor).then(() => false)
            ]);

            if (interrupted) {
                this.debug(['Connection closed while waiting for the send rate limit to reset, re-queueing payload']);
                return this.send(payload);
            }

            // This is so the listener from the `once` call is removed
            controller.abort();
        }

        this.sendRateLimitState.sent++;

        this.socket.send(JSON.stringify(payload));
    };

    public on(event: GatewayDispatchEvents, listener: (...args: string[]) => Promise<void> | void): EventEmitter {
        return this.event.on(event, listener);
    }

    public off(event: GatewayDispatchEvents, listener: (...args: string[]) => Promise<void> | void): EventEmitter {
        return this.event.off(event, listener);
    }

    public once(event: GatewayDispatchEvents, listener: (...args: string[]) => Promise<void> | void): EventEmitter {
        return this.event.once(event, listener);
    }

    private debug(messages: [string, ...string[]]) {
        this.event.emit(WebSocketShardEvents.Debug, messages.join('\n\t'));
    }

    private payloadData({ op, d, t }: { op: GatewayOpcodes | null, d?: any, t?: GatewayDispatchEvents | SpotifyEvents | null }): string {
        return JSON.stringify({ op: op ?? null, t: t ?? null, d: d ?? null });
    }

    private async webhookLog(data: RESTPostAPIWebhookWithTokenJSONBody): Promise<void> {
        await fetch(process.env.WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data, null, 2)
        })
            .catch((err: unknown) => {
                Logger.error((err as Error).message, [Gateway.name, this.webhookLog.name]);
                Logger.warn((err as Error).stack, [Gateway.name, this.webhookLog.name]);
            });
    }
}

export { Gateway };