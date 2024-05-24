import { Logger } from './utils/util';

class Client {
    public logger: Logger = new Logger();

    protected constructor() {
        process.on('uncaughtException', (err: Error) => this.logger.error(err.stack as string, 'uncaughtException'));
        process.on('unhandledRejection', (err: Error) => this.logger.error(err.stack as string, 'unhandledRejection'));
    }
}

export { Client };