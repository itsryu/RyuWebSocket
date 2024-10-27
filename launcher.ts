import { config } from 'dotenv';
import { Server } from './src/api/server';

config({ path: './.env' });

const server = new Server();

server.listen();