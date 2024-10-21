import { config } from 'dotenv';
import { Server } from './src/api/server';
import { Logger } from './src/utils/logger';

config({ path: './.env' });

(async () => {
    const server = new Server();
    await server.listen();
})()
    .catch((err: unknown) => {
        Logger.error((err as Error).message, 'Launcher');
        process.exit(1);
    });