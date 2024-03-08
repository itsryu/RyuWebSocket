import WebSocket, { Server } from 'ws';
import { ClientOptions, DiscordUser, MemberPresence } from './types/DiscordInterfaces';
import { GatewayOpcodes, GatewayDispatchEvents, Snowflake, GatewayReceivePayload, GatewaySendPayload, GatewayRequestGuildMembersDataWithUserIds, RESTPostAPIWebhookWithTokenJSONBody, GatewayPresenceUpdateDispatchData, GatewayGuildMembersChunkDispatchData, GatewayReadyDispatchData } from 'discord-api-types/v10';
import { Logger } from './utils/util';
import EventEmitter from 'node:events';
import { IncomingMessage } from 'node:http';
import { EmbedBuilder } from './structures/EmbedConstructor';
import axios from 'axios';

class Gateway {
    private socket!: WebSocket;
    private wss: Server = new Server({ port: process.env.PORT });
    private event: EventEmitter = new EventEmitter();
    public logger: Logger = new Logger();
    private readonly options: ClientOptions;
    private member!: MemberPresence;
    public connections: Map<string, WebSocket> = new Map();
    private resume_url?: string;
    private session?: string;
    private sequence?: number | null;

    constructor(options: ClientOptions) {
        this.options = options;

        process.on('uncaughtException', (err: Error) => this.logger.error(err.stack as string, 'uncaughtException'));
        process.on('unhandledRejection', (err) => this.logger.error(err as string, 'unhandledRejection'));
    }

    private send(op: GatewayOpcodes, d?: any | null): void {
        return this.socket && this.socket.readyState === WebSocket.OPEN ? this.socket.send(JSON.stringify({ op, d })) : undefined;
    };

    public async login(token: Snowflake): Promise<Snowflake> {
        await this.establishConnection(token);
        return token;
    }

    private async establishConnection(token: Snowflake): Promise<void> {
        if (this.session && this.sequence !== undefined) {
            this.resumeConnection(token);
        } else {
            await this.connect(token);
        }
    }

    private resumeConnection(token: Snowflake) {
        this.socket = new WebSocket(`${this.resume_url}?v=10&encoding=json`);

        this.logger.info('Connecting to Discord Gateway...', 'Gateway Resume');

        return new Promise((resolve, reject) => {
            this.socket.on('open', () => {
                this.send(GatewayOpcodes.Resume, {
                    token: token,
                    session_id: this.session,
                    seq: this.sequence
                });

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle('Gateway Resume Connection')
                    .setDescription('WebSocket connection was resumed successfully!')
                    .setTimestamp(new Date().toISOString());

                this.logger.info("WebSocket it's on CONNECTED state.", 'Gateway Resume');
                this.webhookLog({ embeds: [embed] });
            });

            this.socket.on('message', async (data: string) => {
                const { op, t, d, s }: GatewayReceivePayload = JSON.parse(data);

                this.sequence = s;

                if (op === GatewayOpcodes.Hello) {
                    const jitter = Math.random();
                    const firstWait = Math.floor(d.heartbeat_interval * jitter);

                    const embed = new EmbedBuilder()
                        .setColor(0xffce47)
                        .setTitle('Gateway Resume Connection')
                        .setDescription(`Preparing first heartbeat of the connection with a jitter of ${jitter}; waiting ${firstWait}ms`)
                        .setTimestamp(new Date().toISOString());

                    this.logger.info(`Preparing first heartbeat of the connection with a jitter of ${jitter}; waiting ${firstWait}ms`, 'Gateway Resume');
                    this.webhookLog({ embeds: [embed] });

                    const pingInterval = setInterval(() => {
                        this.socket.readyState === WebSocket.OPEN ? (this.socket.ping(), this.send(GatewayOpcodes.Heartbeat, null)) : (clearInterval(pingInterval), this.establishConnection(token));
                    }, d.heartbeat_interval);
                };

                if (op === GatewayOpcodes.Reconnect) {
                    const embed = new EmbedBuilder()
                        .setColor(0xffce47)
                        .setTitle('Gateway Resume Connection')
                        .setDescription('Received reconnect opcode, reconnecting..')
                        .setTimestamp(new Date().toISOString());

                    this.webhookLog({ embeds: [embed] });
                    this.logger.warn('Received reconnect opcode, reconnecting..', 'Gateway Resume');
                    this.socket.close();
                    this.establishConnection(token);
                }

                if (op === GatewayOpcodes.InvalidSession) {
                    const embed = new EmbedBuilder()
                        .setColor(0xffce47)
                        .setTitle('Gateway Resume Connection')
                        .setDescription('Received invalid session opcode, reconnecting..')
                        .setTimestamp(new Date().toISOString());

                    this.webhookLog({ embeds: [embed] });
                    this.logger.warn('Received invalid session opcode, reconnecting..', 'Gateway Resume');

                    this.socket.close();
                    this.establishConnection(token);
                }

                // handling events:
                if (op === GatewayOpcodes.Dispatch && t) {
                    if ([GatewayDispatchEvents.Ready].includes(t)) {
                        const { resume_gateway_url, session_id } = d as GatewayReadyDispatchData;

                        const embed = new EmbedBuilder()
                            .setColor(0x1ed760)
                            .setTitle('Gateway Connection')
                            .setDescription('Received ready event, connection established!')
                            .setTimestamp(new Date().toISOString());

                        this.webhookLog({ embeds: [embed] });

                        this.resume_url = resume_gateway_url;
                        this.session = session_id;
                    }

                    // guild member chunk event
                    if ([GatewayDispatchEvents.GuildMembersChunk].includes(t)) {
                        const { members, presences, guild_id } = d as GatewayGuildMembersChunkDispatchData;

                        if (Object.keys(d).length && members.length && members[0].user?.id === process.env.USER_ID) {
                            const data: DiscordUser = await axios.get(`https://discord.com/api/v10/users/${members[0].user?.id}/profile`, {
                                method: 'GET',
                                headers: {
                                    Authorization: `${process.env.USER_TOKEN}`
                                }
                            })
                                .then((res) => res.data)
                                .catch(() => {});

                            this.member = { ...this.member, activities: presences?.[0].activities, data, members, guild_id, presences };

                            this.event.emit(GatewayDispatchEvents.GuildMembersChunk, this.member);
                        };
                    }

                    // presence update event
                    if ([GatewayDispatchEvents.PresenceUpdate].includes(t)) {
                        const { user, activities, status, guild_id } = d as GatewayPresenceUpdateDispatchData;

                        if (Object.keys(d).length && user.id === process.env.USER_ID) {
                            this.member = { ...this.member, activities, status, guild_id };

                            this.event.emit(GatewayDispatchEvents.PresenceUpdate, this.member);
                        }
                    }
                }
            });

            this.socket.on('pong', () => {
                this.logger.info('Pong received from Gateway!', 'Gateway Resume');
            });

            this.socket.on('close', (code: number) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Gateway Resume Connection')
                    .setDescription(`Gateway connection was closed with code: ${code}`)
                    .setTimestamp(new Date().toISOString());

                this.webhookLog({ embeds: [embed] });
                this.logger.warn(`Error code: ${code}`, 'Gateway Resume');
                reject(code);

                if (code === 1000 || code === 1001) {
                    this.logger.info('Connection closed successfully.', 'Gateway Resume');
                } else {
                    this.logger.warn('Connection closed with errors. Attempt to reconnect', 'Gateway Resume');
                    this.establishConnection(token);
                }
            });

            this.socket.on('error', (error) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Gateway Resume Connection')
                    .setDescription(`Error on Gateway connection: ${error}`)
                    .setTimestamp(new Date().toISOString());

                this.webhookLog({ embeds: [embed] });
                this.logger.error('Error on Websocket connection: ' + error, 'Gateway Resume');
                reject(error);
                this.establishConnection(token);
            });

            this.wss.on('connection', this.handleConnection.bind(this));
        });
    }

    private connect(token: Snowflake) {
        this.socket = new WebSocket(process.env.GATEWAY_URL);

        this.logger.info('Connecting to Discord Gateway...', 'Gateway');

        return new Promise((resolve, reject) => {
            this.socket.on('open', () => {
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

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle('Gateway Connection')
                    .setDescription('WebSocket connection was opened successfully!')
                    .setTimestamp(new Date().toISOString());

                this.logger.info("WebSocket it's on CONNECTED state.", 'Gateway');
                this.webhookLog({ embeds: [embed] });
            });

            this.socket.on('message', async (data: string) => {
                const { op, t, d, s }: GatewayReceivePayload = JSON.parse(data);

                this.sequence = s;

                if (op === GatewayOpcodes.Hello) {
                    const jitter = Math.random();
                    const firstWait = Math.floor(d.heartbeat_interval * jitter);

                    const embed = new EmbedBuilder()
                        .setColor(0xffce47)
                        .setTitle('Gateway Connection')
                        .setDescription(`Preparing first heartbeat of the connection with a jitter of ${jitter}; waiting ${firstWait}ms`)
                        .setTimestamp(new Date().toISOString());

                    this.logger.info(`Preparing first heartbeat of the connection with a jitter of ${jitter}; waiting ${firstWait}ms`, 'Gateway');
                    this.webhookLog({ embeds: [embed] });

                    const pingInterval = setInterval(() => {
                        this.socket.readyState === WebSocket.OPEN ? (this.socket.ping(), this.send(GatewayOpcodes.Heartbeat, null)) : (clearInterval(pingInterval), this.establishConnection(token));
                    }, d.heartbeat_interval);
                };

                if (op === GatewayOpcodes.Heartbeat) {
                    this.logger.info('Received heartbeat opcode, sending heartbeat..', 'Gateway');
                    this.send(GatewayOpcodes.Heartbeat, null);
                }

                if (op === GatewayOpcodes.HeartbeatAck) {
                    this.logger.info('Received heartbeat ack opcode.', 'Gateway');
                }

                if (op === GatewayOpcodes.Reconnect) {
                    const embed = new EmbedBuilder()
                        .setColor(0xffce47)
                        .setTitle('Gateway Connection')
                        .setDescription('Received reconnect opcode, reconnecting..')
                        .setTimestamp(new Date().toISOString());

                    this.webhookLog({ embeds: [embed] });
                    this.logger.warn('Received reconnect opcode, reconnecting..', 'Gateway');
                    this.socket.close();
                    this.establishConnection(token);
                }

                if (op === GatewayOpcodes.InvalidSession) {
                    const embed = new EmbedBuilder()
                        .setColor(0xffce47)
                        .setTitle('Gateway Connection')
                        .setDescription('Received invalid session opcode, reconnecting..')
                        .setTimestamp(new Date().toISOString());

                    this.webhookLog({ embeds: [embed] });
                    this.logger.warn('Received invalid session opcode, reconnecting..', 'Gateway');
                }

                // handling events:
                if (op === GatewayOpcodes.Dispatch && t) {
                    if ([GatewayDispatchEvents.Ready].includes(t)) {
                        const { resume_gateway_url, session_id } = d as GatewayReadyDispatchData;

                        const embed = new EmbedBuilder()
                            .setColor(0x1ed760)
                            .setTitle('Gateway Connection')
                            .setDescription('Received ready event, connection established!')
                            .setTimestamp(new Date().toISOString());

                        this.webhookLog({ embeds: [embed] });

                        this.resume_url = resume_gateway_url;
                        this.session = session_id;
                    }

                    // guild member chunk event
                    if ([GatewayDispatchEvents.GuildMembersChunk].includes(t)) {
                        const { members, presences, guild_id } = d as GatewayGuildMembersChunkDispatchData;

                        if (Object.keys(d).length && members.length && members[0].user?.id === process.env.USER_ID) {
                            const data: DiscordUser = await axios.get(`https://discord.com/api/v10/users/${members[0].user?.id}/profile`, {
                                method: 'GET',
                                headers: {
                                    Authorization: `${process.env.USER_TOKEN}`
                                }
                            })
                                .then((res) => res.data)
                                .catch(() => {});

                            this.member = { ...this.member, activities: presences?.[0].activities, data, members, guild_id, presences };

                            this.event.emit(GatewayDispatchEvents.GuildMembersChunk, this.member);
                        };
                    }

                    // presence update event
                    if ([GatewayDispatchEvents.PresenceUpdate].includes(t)) {
                        const { user, activities, status, guild_id, client_status } = d as GatewayPresenceUpdateDispatchData;

                        if (Object.keys(d).length && user.id === process.env.USER_ID) {
                            this.member = { ...this.member, user, activities, status, guild_id, client_status };

                            this.event.emit(GatewayDispatchEvents.PresenceUpdate, this.member);
                        }
                    }
                }
            });

            this.socket.on('pong', () => {
                this.logger.info('Pong received from Gateway!', 'Gateway');
            });

            this.socket.on('close', (code: number) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Gateway Connection')
                    .setDescription(`Gateway connection was closed with code: ${code}`)
                    .setTimestamp(new Date().toISOString());

                this.webhookLog({ embeds: [embed] });
                this.logger.warn(`Error code: ${code}`, 'Gateway');
                reject(code);

                if (code === 1000 || code === 1001) {
                    this.logger.info('Connection closed successfully.', 'Gateway Resume');
                } else {
                    this.logger.warn('Connection closed with errors. Attempt to reconnect', 'Gateway Resume');
                    this.establishConnection(token);
                }
            });

            this.socket.on('error', (error) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Gateway Connection')
                    .setDescription(`Error on Gateway connection: ${error}`)
                    .setTimestamp(new Date().toISOString());

                this.webhookLog({ embeds: [embed] });
                this.logger.error('Error on Websocket connection: ' + error, 'Gateway');
                this.establishConnection(token);

                reject(error);
            });

            this.wss.on('connection', this.handleConnection.bind(this));
        });
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

    private payloadData({ op, d, t }: { op: GatewayOpcodes | null, d?: any, t?: any }): string {
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
            .catch((err) => this.logger.error(`Error while sending webhook: ${err}`, 'Webhook'));
    }

    private handleConnection(ws: WebSocket, req: IncomingMessage) {
        const id = Math.random().toString(36).substring(7);

        this.connections.set(id, ws);

        const ipObject = req.headers['x-forwarded-for'];
        const ip = typeof (ipObject) === 'object' ? ipObject[0] : ipObject?.split(',')[0];
        const interval = 41250;

        setInterval(() => ws.send(this.payloadData({ op: GatewayOpcodes.Heartbeat, d: { heartbeat_interval: interval } })), interval);

        this.event.on(GatewayDispatchEvents.PresenceUpdate, (data) => ws.send(this.payloadData({ op: GatewayOpcodes.Dispatch, t: GatewayDispatchEvents.PresenceUpdate, d: data })));
        this.event.on(GatewayDispatchEvents.GuildMembersChunk, (data) => ws.send(this.payloadData({ op: GatewayOpcodes.Dispatch, t: GatewayDispatchEvents.GuildMembersChunk, d: data })));

        const pingInterval = setInterval(() => {
            ws.readyState === WebSocket.OPEN ? ws.ping() : clearInterval(pingInterval);
        }, interval);

        ws.on('message', (data: string) => {
            const buffer = Buffer.from(data, 'hex');
            const str = buffer.toString('utf8');

            const { op, d }: GatewaySendPayload = JSON.parse(str);

            switch (op) {
                case GatewayOpcodes.Heartbeat: {
                    ws.readyState === WebSocket.OPEN ? ws.ping() : clearInterval(pingInterval);
                    return ws.send(this.payloadData({ op: GatewayOpcodes.Heartbeat }));
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

                    this.webhookLog({ embeds: [embed] });
                    return this.logger.info(`[${id}] - [${ip}]: requested a guild member.`, 'WebSocket');
                }

                default: {
                    return ws.send(this.payloadData({ op: null, t: null, d: null }));
                }
            }
        });

        ws.on('pong', () => {
            this.logger.info(`[${id}] - [${ip}]: pong received from connection!`, 'WebSocket');
        });

        ws.on('close', (code: number) => {
            this.connections.delete(id);

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle(`[${id}] - Connection closed!`)
                .setDescription(`[${id}] - [${ip}]: was disconnected by code: ${code}.`)
                .setFooter({ text: `Connections: ${this.connections.size}` })
                .setTimestamp(new Date().toISOString());

            this.webhookLog({ embeds: [embed] });
            this.logger.warn(`[${id}] - [${ip}]: was disconnected by code: ${code}.`, 'Websocket');
            this.logger.info(`${this.connections.size} connections opened.`, 'Websocket');

            clearInterval(pingInterval);
        });

        ws.on('error', (error) => {
            this.connections.delete(id);

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle(`[${id}] - Connection error!`)
                .setDescription(`[${id}] - [${ip}]: was disconnected by error: ${error.message}.`)
                .setFooter({ text: `Connections: ${this.connections.size}` })
                .setTimestamp(new Date().toISOString());

            this.webhookLog({ embeds: [embed] });
            this.logger.error(`[${id}] - [${ip}]: was disconnected by error: ${error.message}.`, 'Websocket');
            this.logger.info(`${this.connections.size} connections opened.`, 'Websocket');
            this.logger.warn(error.stack as string, 'Websocket');

            ws.terminate();
            clearInterval(pingInterval);
        });

        const embed = new EmbedBuilder()
            .setColor(0x1ed760)
            .setTitle(`[${id}] - New WebSocket Connection`)
            .setURL(`https://tools.keycdn.com/geo?host=${ip}`)
            .setDescription(`[${id}] - [${ip}]: connected successfully to websocket.`)
            .setFooter({ text: `Connections: ${this.connections.size}` })
            .setTimestamp(new Date().toISOString());

        this.webhookLog({ embeds: [embed] });
        this.logger.info(`[${id}] - [${ip}]: was connected successfully.`, 'WebSocket');
        this.logger.info('A new connection was opened.', 'Websocket');
        this.logger.info(`${this.connections.size} connections opened.`, 'Websocket');
    }
}

export { Gateway };