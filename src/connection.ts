import { GatewayOpcodes, GatewayRequestGuildMembersDataWithUserIds } from 'discord-api-types/v10';
import { IncomingMessage } from 'http';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { Util } from './utils/util';
import { EmbedBuilder } from './structures';
import { Logger } from './utils/logger';
import { WebsocketOpcodes, WebsocketReceivePayload, WebSocketUser, WebSocketState } from './types';
import { Gateway } from './gateway';
import { Info } from './utils/info';

class Connection {
    private server: WebSocketServer;
    private gateway: Gateway;
    private static pingInterval: number = 41250;

    constructor(server: WebSocketServer, gateway: Gateway) {
        this.server = server;
        this.server.on('connection', this.onConnect.bind(this));
        this.gateway = gateway;
    }

    private async onConnect(ws: WebSocket, req: IncomingMessage) {
        const id = Util.randomId;
        const info = Info.getClientInfo(req, ws);
        const message = Info.getClientInfoMessage(info);
        const user: WebSocketUser = { id, ip: info.ipAddress, ws, isAlive: true, pingInterval: null };

        // start the heartbeat
        this.heartbeat(user);

        user.ws.on('message', async (message) => { await this.onMessage(user, message); });
        user.ws.on('close', (code) => { this.onClose(user, code); });
        user.ws.on('error', (error) => { this.onError(user, error); });

        this.gateway.addUser(user);
        this.send(user, { op: WebsocketOpcodes.Connected, t: WebSocketState.Connected, d: null });

        const embed = new EmbedBuilder()
            .setColor(0x1ed760)
            .setTitle('Websocket Connection')
            .setDescription(message.join('\n'))
            .setTimestamp(new Date().toISOString());

        await Util.webhookLog({ embeds: [embed] });
        Logger.info(`[${user.id}] - [${user.ip}]: connection established!`, [Connection.name, this.onConnect.name]);
    }

    private async onMessage(user: WebSocketUser, data: RawData) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'hex');
        const str = buffer.toString('utf8');
        let parsed: WebsocketReceivePayload;

        try {
            parsed = JSON.parse(str) as WebsocketReceivePayload;
        } catch (err) {
            this.send(user, { op: null, t: null, d: null });
            Logger.error(`[${user.id}] - [${user.ip}]: invalid payload sent: ${err}`, [Connection.name, this.onMessage.name]);
            return;
        }

        const { op, d } = parsed;

        switch (op) {
            case WebsocketOpcodes.Heartbeat: {
                this.send(user, { op: WebsocketOpcodes.Heartbeat, t: WebSocketState.Heartbeat });
                user.ws.ping();

                break;
            }

            // op: 8
            case GatewayOpcodes.RequestGuildMembers: {
                user.id = (d as GatewayRequestGuildMembersDataWithUserIds).user_ids as string;
                
                await this.handleRequestGuildMembers(d as GatewayRequestGuildMembersDataWithUserIds);

                const embed = new EmbedBuilder()
                    .setColor(0x1ed760)
                    .setTitle(`[${user.id}] - Connection request!`)
                    .setDescription(`[${user.id}] - [${user.ip}]: requested a guild member.`)
                    .setTimestamp(new Date().toISOString());

                await Util.webhookLog({ embeds: [embed] });
                Logger.info(`[${user.id}] - [${user.ip}]: requested a guild member.`, [Connection.name, this.onMessage.name]);
                break;
            }

            default: {
                this.send(user, { op: null, t: null, d: null });
                break;
            }
        }
    }

    private onClose(user: WebSocketUser, code: number) {
        Logger.warn(`[${user.id}] - [${user.ip}]: connection closed with code ${code}`, [Connection.name, this.onClose.name]);
        this.destroy(user);
    }

    private onError(user: WebSocketUser, error: Error) {
        Logger.error(`[${user.id}] - [${user.ip}]: connection error: ${error.message}`, [Connection.name, this.onError.name]);
        this.destroy(user);
    }

    private async handleRequestGuildMembers(data: GatewayRequestGuildMembersDataWithUserIds) {
        const { user_ids } = data;

        await this.gateway.send({
            op: GatewayOpcodes.RequestGuildMembers,
            d: {
                guild_id: process.env.GUILD_ID,
                user_ids: user_ids,
                presences: true,
                limit: 0
            }
        });
    }

    private clearPingInterval(user: WebSocketUser) {
        if (user.pingInterval) {
            clearInterval(user.pingInterval);
            user.pingInterval = null;
        }
    }

    private removeListeners(user: WebSocketUser) {
        user.ws.removeAllListeners('message');
        user.ws.removeAllListeners('close');
        user.ws.removeAllListeners('error');
        user.ws.removeAllListeners('pong');
    }

    private destroy(user: WebSocketUser) {
        this.clearPingInterval(user);
        this.removeListeners(user);
        this.gateway.removeUser(user.ws);
        user.ws.terminate();
    }

    private heartbeat(user: WebSocketUser) {
        user.ws.on('pong', () => {
            Logger.info(`[${user.id}] - [${user.ip}]: pong received!`, [Connection.name, this.heartbeat.name]);
            user.isAlive = true;
        });

        user.pingInterval = setInterval(() => {
            if (!user.isAlive) {
                this.send(user, { op: WebsocketOpcodes.Disconnected, t: WebSocketState.Disconnected, d: null });
                this.destroy(user);

                return;
            }

            user.isAlive = false;
            user.ws.ping();
        }, Connection.pingInterval);
    }

    private send(user: WebSocketUser, payload: WebsocketReceivePayload) {
        if (!user.ws || user.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        try {
            user.ws.send(JSON.stringify(payload));
        } catch (error) {
            Logger.error(`[${user.id}] - [${user.ip}]: failed to send message: ${(error as Error).message}`, [Connection.name, this.send.name]);
            this.destroy(user);
        }
    }
}

export { Connection };