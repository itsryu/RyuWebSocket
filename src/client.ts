import { createServer, Server } from 'http';
import express, { Express } from 'express';
import { WebSocketServer } from 'ws';
import { Logger } from './utils/logger';
import { Connection } from './connection';

class Client {
    private port: string = process.env.PORT;
    public app: Express = express();
    public server!: Server;
    public wss!: WebSocketServer;

    protected constructor() {
        process.on('uncaughtException', (err: Error) => { Logger.error(err.stack, 'uncaughtException'); });
        process.on('unhandledRejection', (err: Error) => { Logger.error(err.stack, 'unhandledRejection'); });
    }

    public listen() {
        this.server = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });

        this.server.listen(this.port, () => {
            Logger.info(`Server is running at ${process.env.STATE == 'development' ? `${process.env.LOCAL_URL}:${this.port}/` : process.env.DOMAIN_URL}`, 'Server');
            new Connection(this.wss);
        });
    }
}

export { Client };