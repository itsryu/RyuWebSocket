import { config } from 'dotenv';
import { Server } from './src/api/server';

config({ path: './.env' });

(async () => {
    const client = new Server();
    await client.listen();
})();

