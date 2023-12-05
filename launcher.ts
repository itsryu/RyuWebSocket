import { config } from 'dotenv';
import { Socket } from './client';
import { GatewayIntentBits } from 'discord-api-types/v10';

config();

new Socket({
    intents: [
        GatewayIntentBits.GuildPresences
    ]
}).initialize();