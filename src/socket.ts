import WebSocket, { Server } from 'ws';
import { ClientOptions, DiscordUser, MemberPresence } from './types/DiscordInterfaces';
import { GatewayOpcodes, GatewayDispatchEvents, Snowflake, GatewayReceivePayload, GatewaySendPayload, GatewayRequestGuildMembersDataWithUserIds, RESTPostAPIWebhookWithTokenJSONBody } from 'discord-api-types/v10';
import { Logger } from './utils/util';
import EventEmitter from 'node:events';
import { IncomingMessage } from 'node:http';
import { EmbedBuilder } from './structures/EmbedConstructor';

let connectionAttempt = 0;

class Gateway {
    private socket!: WebSocket;
    private wss: Server = new Server({ port: process.env.PORT });
    private event: EventEmitter = new EventEmitter();
    public logger: Logger = new Logger();
    private readonly options: ClientOptions;
    private member!: MemberPresence;
    public connections: Map<string, WebSocket> = new Map();

    constructor(options: ClientOptions) {
        this.options = options;

        process.on('uncaughtException', (err: Error) => this.logger.error(err.stack as string, 'uncaughtException'));
        process.on('unhandledRejection', (err) => this.logger.error(err as string, 'unhandledRejection'));
    }

    private send(op: GatewayOpcodes, d?: any | null): void {
        return this.socket && this.socket.readyState === WebSocket.OPEN ? this.socket.send(JSON.stringify({ op, d })) : undefined;
    };

    public async login(token: Snowflake): Promise<Snowflake> {
        await this.connect(token);
        return token;
    }

    private connect(token: Snowflake): Promise<string> {
        this.socket = new WebSocket(process.env.GATEWAY_URL);

        this.logger.info('Connecting to Discord Gateway...', 'Gateway');

        return new Promise((resolve, reject) => {
            const embed = new EmbedBuilder()
                .setColor(0x1ed760)
                .setTitle('Gateway Connection')
                .setDescription('WebSocket connection was opened successfully!')
                .setTimestamp(new Date().toISOString());

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

                this.logger.info("WebSocket it's on CONNECTED state.", 'Gateway');
                this.webhookLog({ embeds: [embed] });
            });

            this.socket.on('message', async (data: string) => {
                const { op, t, d }: GatewayReceivePayload = JSON.parse(data);



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
                        this.socket.readyState === WebSocket.OPEN ? (this.socket.ping(), this.send(GatewayOpcodes.Heartbeat, null)) : (clearInterval(pingInterval), this.reconnectWebSocket(token));
                    }, d.heartbeat_interval);
                };

                if (op === GatewayOpcodes.Reconnect) {
                    this.reconnectWebSocket(token);
                }

                // handling events:
                if (op === GatewayOpcodes.Dispatch && t) {
                    const { members, presences, guild_id } = d as MemberPresence;

                    // guild member chunk event
                    if ([GatewayDispatchEvents.GuildMembersChunk].includes(t) && members.length) {
                        if (Object.keys(d).length) {
                            const data: DiscordUser = await fetch(`https://discord.com/api/v10/users/${members[0].user?.id}/profile`, {
                                method: 'GET',
                                headers: {
                                    Authorization: `${process.env.USER_TOKEN}`
                                }
                            }).then((res) => res.json());

                            this.member = { ...this.member, activities: presences?.[0].activities, data, members, guild_id, presences };

                            this.event.emit(GatewayDispatchEvents.GuildMembersChunk, this.member);
                        };
                    }

                    // presence update event
                    if ([GatewayDispatchEvents.PresenceUpdate].includes(t)) {
                        const { user, activities, status, guild_id } = d as MemberPresence;

                        if (Object.keys(d).length && user.id === process.env.USER_ID) {
                            this.member = { ...this.member, activities, status, guild_id };

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
                this.reconnectWebSocket(token);
            });

            this.socket.on('error', (error) => {
                const embed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Gateway Connection')
                    .setDescription(`Error on Gateway connection: ${error}`)
                    .setTimestamp(new Date().toISOString());

                this.webhookLog({ embeds: [embed] });
                this.logger.error('Error on Websocket connection: ' + error, 'Gateway');
                reject(error);
                this.reconnectWebSocket(token);
            });

            this.wss.on('connection', this.handleConnection.bind(this));
        });
    };

    private reconnectWebSocket(token: Snowflake): void {
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Gateway Connection Reconnect Attempt')
            .setDescription('WebSocket connection was closed!')
            .setTimestamp(new Date().toISOString());

        this.webhookLog({ embeds: [embed] });
        this.logger.warn('Attempting to reconnect, wait..', 'Gateway');

        if (connectionAttempt >= 5) {
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('Gateway Connection Reconnect Attempt')
                .setDescription('Max connection attempts reached!')
                .setTimestamp(new Date().toISOString());

            this.webhookLog({ embeds: [embed] });
            return this.logger.error('Max connection attempts reached..', 'Gateway');
        }

        const reconnectSocketInterval = setTimeout(() => {
            this.connect(token)
                .then(() => {
                    const embed = new EmbedBuilder()
                        .setColor(0x1ed760)
                        .setTitle('Gateway Connection Reconnect Attempt')
                        .setDescription('Reconnected successfully to Discord gateway.')
                        .setTimestamp(new Date().toISOString());

                    this.webhookLog({ embeds: [embed] });
                    clearInterval(reconnectSocketInterval);
                    this.logger.info('Reconnected successfully to Discord gateway.', 'Gateway - Reconnect');
                })
                .catch((err) => {
                    const embed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('Gateway Connection Reconnect Attempt')
                        .setDescription(`Error while tryng to reconnect to Discord gateway: ${err}`)
                        .setTimestamp(new Date().toISOString());

                    this.webhookLog({ embeds: [embed] });
                    this.logger.error(`Error while tryng to reconnect to Discord gateway: ${err}`, 'Gateway - Reconnect');
                });
        }, 1000 * 15);

        connectionAttempt++;
    }

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
        });
    }

    private handleConnection(ws: WebSocket, req: IncomingMessage) {
        const id = Math.random().toString(36).substring(7);

        this.connections.set(id, ws);

        const ip = req.headers['x-forwarded-for'];
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
            const embed = new EmbedBuilder()
                .setColor(0x1ed760)
                .setTitle(`[${id}] - Connection pong!`)
                .setDescription(`[${id}] - [${ip}]: pong received!`)
                .setTimestamp(new Date().toISOString());

            this.webhookLog({ embeds: [embed] });
            this.logger.info(`[${id}] - [${ip}]: pong received!`, 'WebSocket');
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
            .setURL(`https://tools.keycdn.com/geo?host=${typeof (ip) === 'object' ? ip[0] : ip?.split(',')[0]}`)
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