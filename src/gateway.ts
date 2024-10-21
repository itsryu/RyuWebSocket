import WebSocket from 'ws';
import { ClientOptions, DiscordUser, MemberPresence } from './types';
import { GatewayOpcodes, GatewayDispatchEvents, Snowflake, GatewayReceivePayload, GatewaySendPayload, GatewayRequestGuildMembersDataWithUserIds, RESTPostAPIWebhookWithTokenJSONBody, GatewayPresenceUpdateDispatchData, GatewayGuildMembersChunkDispatchData, GatewayReadyDispatchData, GatewayDispatchPayload, GatewayMessageCreateDispatchData } from 'discord-api-types/v10';
import EventEmitter from 'node:events';
import { IncomingMessage } from 'node:http';
import { EmbedBuilder } from './structures';
import axios from 'axios';
import { SpotifyEvents, SpotifyTrackResponse } from './types';
import { Base } from './base';
import { SpotifyGetTrackController } from './api/routes';

class Gateway extends Base {
    private wss!: WebSocket.Server;
    private socket!: WebSocket | null;
    public event: EventEmitter = new EventEmitter();
    private readonly options: ClientOptions;
    private member!: MemberPresence;
    public connections = new Map<string, WebSocket>();
    private resume_url?: string;
    private session?: string;
    private sequence?: number | null;

    public constructor(options: ClientOptions, websocketServer: WebSocket.Server) {
        super();

        this.options = options;
        this.wss = websocketServer;
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

    private identify(token: Snowflake) {
        this.send(GatewayOpcodes.Identify, {
            token: token,
            intents: this.options.intents.reduce((a, b) => a | b, 0),
            properties: {
                browser: 'disco',
                device: 'disco',
                os: 'windows'
            },
            large_threshold: 50
        });
    }

    private resume(token: Snowflake) {
        this.send(GatewayOpcodes.Resume, {
            token: token,
            session_id: this.session,
            seq: this.sequence
        });
    }

    private heartbeatInterval(interval: number, sequence?: number | null) {
        const pingInterval = setInterval(() => this.socket?.readyState === WebSocket.OPEN ? (this.socket.ping(), this.send(GatewayOpcodes.Heartbeat, sequence)) : clearInterval(pingInterval), interval);
    }

    // connect to gateway
    private connect(token: Snowflake): Promise<WebSocket | null> {
        this.socket = new WebSocket(process.env.GATEWAY_URL);

        this.logger.info('Connecting to Discord Gateway...', 'Gateway');

        return new Promise((resolve) => {
            this.socket?.on('open', async () => {
                // identifying with the gateway
                this.identify(token);

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle('Gateway')
                    .setDescription('WebSocket connection was opened successfully!')
                    .setTimestamp(new Date().toISOString());

                this.logger.info("WebSocket it's on CONNECTED state.", 'Gateway');
                await this.webhookLog({ embeds: [embed] });

                resolve(this.socket);
            });

            this.socket?.on('message', this.handleMessage.bind(this, token));

            this.socket?.on('pong', () => {
                this.logger.info('Pong received from Gateway!', 'Gateway');
            });

            this.socket?.on('close', async (code: number) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Gateway')
                    .setDescription(`Gateway connection was closed with code: ${code}`)
                    .setTimestamp(new Date().toISOString());

                await this.webhookLog({ embeds: [embed] });
                this.logger.warn(`Error code: ${code}`, 'Gateway');

                if (code === 1000 || code === 1001) {
                    this.logger.info('Connection closed successfully.', 'Gateway');
                } else {
                    this.logger.warn('Connection closed with errors. Attempt to reconnect', 'Gateway');
                    await this.establishConnection(token);
                }

                resolve(null);
            });

            this.socket?.on('error', async (error) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Gateway')
                    .setDescription(`Error on Gateway connection: ${error}`)
                    .setTimestamp(new Date().toISOString());

                await this.webhookLog({ embeds: [embed] });
                this.logger.error('Error on Websocket connection: ' + error.message, 'Gateway');
                await this.establishConnection(token);

                resolve(null);
            });

            this.wss.on('connection', this.handleConnection.bind(this));
        });
    };

    // resume connection from gateway
    private resumeConnection(token: Snowflake): Promise<WebSocket | null> {
        this.socket = new WebSocket(`${this.resume_url}?v=10&encoding=json`);

        this.logger.info('Reconnecting to Discord Gateway...', 'Gateway Resume');

        return new Promise((resolve) => {
            this.socket?.on('open', async () => {
                // resuming connection with the gateway
                this.resume(token);

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle('Gateway Resume')
                    .setDescription('WebSocket connection was resumed successfully!')
                    .setTimestamp(new Date().toISOString());

                this.logger.info("WebSocket it's on CONNECTED state.", 'Gateway Resume');
                await this.webhookLog({ embeds: [embed] });

                resolve(this.socket);
            });

            this.socket?.on('message', this.handleMessage.bind(this, token));

            this.socket?.on('pong', () => {
                this.logger.info('Pong received from Gateway!', 'Gateway Resume');
            });

            this.socket?.on('close', async (code: number) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Gateway Resume')
                    .setDescription(`Gateway connection was closed with code: ${code}`)
                    .setTimestamp(new Date().toISOString());

                await this.webhookLog({ embeds: [embed] });
                this.logger.warn(`Error code: ${code}`, 'Gateway Resume');

                if (code === 1000 || code === 1001) {
                    this.logger.info('Connection closed successfully.', 'Gateway Resume');
                } else {
                    this.logger.warn('Connection closed with errors. Attempt to reconnect', 'Gateway Resume');
                    await this.establishConnection(token);
                }

                resolve(null);
            });

            this.socket?.on('error', async (error) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Gateway Resume')
                    .setDescription(`Error on Gateway connection: ${error}`)
                    .setTimestamp(new Date().toISOString());

                await this.webhookLog({ embeds: [embed] });
                this.logger.error('Error on Websocket connection: ' + error.message, 'Gateway Resume');
                await this.establishConnection(token);

                resolve(null);
            });

            this.wss.on('connection', this.handleConnection.bind(this));
        });
    }

    private async handleMessage(token: Snowflake, data: string): Promise<void> {
        const { op, t, d, s } = JSON.parse(data) as GatewayReceivePayload;

        this.sequence = s;

        if (op === GatewayOpcodes.Hello) {
            const jitter = Math.random();
            const firstWait = Math.floor(d.heartbeat_interval * jitter);

            const embed = new EmbedBuilder()
                .setColor(0xffce47)
                .setTitle('Gateway Message')
                .setDescription(`Preparing first heartbeat of the connection with a jitter of ${jitter}; waiting ${firstWait}ms`)
                .setTimestamp(new Date().toISOString());

            this.logger.info(`Preparing first heartbeat of the connection with a jitter of ${jitter}; waiting ${firstWait}ms`, 'Gateway Message');
            await this.webhookLog({ embeds: [embed] });

            this.heartbeatInterval(d.heartbeat_interval, this.sequence);
        };

        if (op === GatewayOpcodes.Reconnect) {
            const embed = new EmbedBuilder()
                .setColor(0xffce47)
                .setTitle('Gateway Message')
                .setDescription('Received reconnect opcode, reconnecting..')
                .setTimestamp(new Date().toISOString());

            await this.webhookLog({ embeds: [embed] });
            this.logger.warn('Received reconnect opcode, reconnecting..', 'Gateway Message');
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
            this.logger.warn('Received invalid session opcode, reconnecting..', 'Gateway Message');

            this.socket?.close();
            await this.establishConnection(token);
        }

        // handling events:
        if (op === GatewayOpcodes.Dispatch && t) {
            if ([GatewayDispatchEvents.Ready].includes(t)) {
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
    }

    private async handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
        const id = Math.random().toString(36).substring(7);

        this.connections.set(id, ws);

        const connection = this.connections.get(id);

        if (connection) {
            const ipObject = req.headers['x-forwarded-for'];
            const ip = typeof (ipObject) === 'object' ? ipObject[0] : ipObject?.split(',')[0];
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

                        this.send(GatewayOpcodes.RequestGuildMembers, {
                            guild_id: process.env.GUILD_ID,
                            user_ids: user_ids,
                            presences: true,
                            limit: 0
                        });

                        const embed = new EmbedBuilder()
                            .setColor(0x1ed760)
                            .setTitle(`[${id}] - Connection request!`)
                            .setDescription(`[${id}] - [${ip}]: requested a guild member.`)
                            .setTimestamp(new Date().toISOString());

                        await this.webhookLog({ embeds: [embed] });
                        this.logger.info(`[${id}] - [${ip}]: requested a guild member.`, 'Connection');
                        break;
                    }

                    default: {
                        connection?.send(this.payloadData({ op: null, t: null, d: null }));
                        break;
                    }
                }
            });

            connection?.on('pong', () => {
                this.logger.info(`[${id}] - [${ip}]: pong received from connection!`, 'Connection');
            });

            connection?.on('close', async (code: number) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle(`[${id}] - Connection closed!`)
                    .setDescription(`[${id}] - [${ip}]: was disconnected by code: ${code}.`)
                    .setFooter({ text: `Connections: ${this.connections.size}` })
                    .setTimestamp(new Date().toISOString());

                await this.webhookLog({ embeds: [embed] });
                this.logger.warn(`[${id}] - [${ip}]: was disconnected by code: ${code}.`, 'Connection');
                this.logger.info(`${this.connections.size} connections opened.`, 'Connection');

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
                this.logger.error(`[${id}] - [${ip}]: was disconnected by error: ${error.message}.`, 'Connection');
                this.logger.info(`${this.connections.size} connections opened.`, 'Connection');
                this.logger.warn(error.stack, 'Connection');

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
            this.logger.info(`[${id}] - [${ip}]: was connected successfully.`, 'Connection');
            this.logger.info('A new connection was opened.', 'Connection');
            this.logger.info(`${this.connections.size} connections opened.`, 'Connection');
        }
    }

    private send(op: GatewayOpcodes, d?: any): void {
        this.socket && this.socket.readyState === WebSocket.OPEN ? this.socket.send(JSON.stringify({ op, d })) : undefined;
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
                this.logger.error((err as Error).message, [Gateway.name, this.webhookLog.name]);
                this.logger.warn((err as Error).stack, [Gateway.name, this.webhookLog.name]);
            });
    }
}

export { Gateway };