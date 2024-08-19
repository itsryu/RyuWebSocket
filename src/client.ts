import { createServer, Server } from 'http';
import express, { Express } from 'express';
import { WebSocketServer } from 'ws';
import { GatewayIntentBits } from 'discord-api-types/v10';
import { Gateway } from './gateway';
import { Base } from './base';

class Client extends Base {
    private port: number = process.env.PORT;
    public app: Express = express();
    public server!: Server;
    public wss!: WebSocketServer;

    protected constructor() {
        super();

        process.on('uncaughtException', (err: Error) => { this.logger.error(err.stack, 'uncaughtException'); });
        process.on('unhandledRejection', (err: Error) => { this.logger.error(err.stack, 'unhandledRejection'); });
    }

    public async listen() {
        this.server = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });

        const gateway = new Gateway({
            intents: [
                GatewayIntentBits.GuildPresences
            ]
        }, this.wss);

        await gateway.login(process.env.CLIENT_TOKEN);

        this.server.listen(this.port, () => {
            this.logger.info(`Server is running at ${process.env.STATE == 'development' ? `${process.env.LOCAL_URL}:${this.port}/` : process.env.DOMAIN_URL}`, 'Server');
        });
    }
}

export { Client };