import { ClientOptions } from './src/types/DiscordInterfaces';
import { Gateway } from './src/gateway';

export class Socket extends Gateway {
    public constructor(options: ClientOptions) {
        super(options);
    }

    async initialize() {
        await super.login(process.env.CLIENT_TOKEN);
    }
}