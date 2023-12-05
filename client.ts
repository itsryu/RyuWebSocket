import { ClientOptions } from './src/types/DiscordInterfaces';
import { Gateway } from './src/socket';

export class Socket extends Gateway {
    constructor(options: ClientOptions) {
        super(options);
    }

    async initialize() {
        await super.login(process.env.TOKEN);
    }
}