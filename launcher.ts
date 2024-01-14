import { config } from 'dotenv';
import { Socket } from './client';
import { GatewayIntentBits } from 'discord-api-types/v10';

config({ path: './.env' });

new Socket({
    intents: [
        GatewayIntentBits.GuildPresences
    ]
}).initialize();