import { createServer, Server } from 'http';
import express, { Express } from 'express';
import { WebSocketServer } from 'ws';
import { Logger } from './utils/logger';
import { Connection } from './connection';
import { Gateway } from './gateway';
import { GatewayIntentBits } from 'discord-api-types/v10';

class Client {
    private port: string = process.env.PORT;
    public app: Express = express();
    public server: Server;
    public wss: WebSocketServer;
    public connection: Connection | null = null;
    public gateway: Gateway | null = null;
    public gatewayGuildMemberData: Map<string, string> = new Map<string, string>();

    protected constructor() {
        this.server = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });

        process.on('uncaughtException', (err: Error) => { Logger.error(err.stack, 'uncaughtException'); });
        process.on('unhandledRejection', (err: Error) => { Logger.error(err.stack, 'unhandledRejection'); });
    }

    public listen() {
        this.server.listen(this.port, () => {
            Logger.info(`Server is running at ${process.env.STATE == 'development' ? `${process.env.LOCAL_URL}:${this.port}/` : process.env.DOMAIN_URL}`, 'Server');
        });

        this.gateway = new Gateway({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        }, this.gatewayGuildMemberData);

        this.gateway.login(process.env.CLIENT_TOKEN)
            .catch(() => {
                Logger.error('Failed to login to gateway. Please check your CLIENT_TOKEN and network connection.', [Connection.name, this.constructor.name]);
            });

        if (this.gateway) {
            this.connection = new Connection(this.wss, this.gateway);
        } else {
            Logger.error('Failed to initialize connection. Please check your gateway instance.', [Connection.name, this.constructor.name]);
        }
    }
}

export { Client };