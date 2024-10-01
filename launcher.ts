import { config } from 'dotenv';
import { Server } from './src/api/server';

config({ path: './.env' });

(async () => {
    const server = new Server();
    await server.listen();
})()
    .catch((err: unknown) => {
        console.error((err as Error).message);
        process.exit(1);
    });