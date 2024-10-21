import { createServer, Server } from 'http';
import express, { Express } from 'express';
import { WebSocketServer } from 'ws';
import { GatewayDispatchEvents, GatewayIntentBits, GatewayMessageCreateDispatchData } from 'discord-api-types/v10';
import { Gateway } from './gateway';
import { Base } from './base';
import { inspect } from 'node:util';
import { Logger } from './utils/logger';

class Client extends Base {
    private port: number = process.env.PORT;
    public app: Express = express();
    public server!: Server;
    public wss!: WebSocketServer;

    protected constructor() {
        super();

        process.on('uncaughtException', (err: Error) => { Logger.error(err.stack, 'uncaughtException'); });
        process.on('unhandledRejection', (err: Error) => { Logger.error(err.stack, 'unhandledRejection'); });
    }

    public async listen() {
        this.server = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });

        const gateway = new Gateway({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        }, this.wss);

        gateway.event.on(GatewayDispatchEvents.MessageCreate, async (message: GatewayMessageCreateDispatchData) => {
            const { content, author } = message;
            const prefix = 'm.';
            const [...args] = content.slice(prefix.length).trim().split(/ +/g);

            if (author.id === process.env.USER_ID && args[0] === 'eval') {
                const res = args.slice(1).join(' ');
                const result: unknown = await Promise.any([eval(res), Promise.reject(new Error('Nenhum resultado retornado.'))]);
                const evaled = inspect(result);

                Logger.debug(evaled, 'Eval');
            }
        });

        await gateway.login(process.env.CLIENT_TOKEN);

        this.server.listen(this.port, () => {
            Logger.info(`Server is running at ${process.env.STATE == 'development' ? `${process.env.LOCAL_URL}:${this.port}/` : process.env.DOMAIN_URL}`, 'Server');
        });
    }
}

export { Client };