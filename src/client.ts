import { createServer } from 'http';
import { Logger } from './utils/util';
import express, { Express } from 'express';
import { Server } from 'ws';

class Client {
    private port!: number;
    public app: Express = express();
    public server = createServer(this.app);
    public ws: Server = new Server({ server: this.server });;
    public logger: Logger = new Logger();

    protected constructor(port: number) {
        this.port = port;

        process.on('uncaughtException', (err: Error) => this.logger.error(err.stack as string, 'uncaughtException'));
        process.on('unhandledRejection', (err: Error) => this.logger.error(err.stack as string, 'unhandledRejection'));
    }

    public listen() {
        this.server.listen(this.port, () => {
            this.logger.info(`Server is running at ${process.env.STATE == 'development' ? `${process.env.LOCAL_URL}:${this.port}/` : `${process.env.DOMAIN_URL}`}`, 'Server');
        });
    }
}

export { Client };