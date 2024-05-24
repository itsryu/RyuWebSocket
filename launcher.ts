import { config } from 'dotenv';
import { Socket } from './socket';
import { GatewayIntentBits } from 'discord-api-types/v10';
import { Server } from './src/api/server';

config({ path: './.env' });

const socket = new Socket({
    intents: [
        GatewayIntentBits.GuildPresences
    ]
});

const server = new Server(process.env.SERVER_PORT);

socket.initialize();
server.listen();