import * as winston from 'winston';

class Logger {
    private logger: winston.Logger;

    private readonly levels: winston.config.AbstractConfigSetLevels = {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        silly: 6
    };

    constructor(level = 'info', environment = process.env.STATE) {
        this.logger = winston.createLogger({
            level,
            levels: this.levels,
            defaultMeta: { environment },
            transports: [
                new winston.transports.Console()
            ],
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.splat(),
                winston.format.json(),
                winston.format.colorize({
                    colors: {
                        error: 'red',
                        warn: 'yellow',
                        info: 'green',
                        debug: 'blue'
                    }
                }),
                winston.format.printf((info) => {
                    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                    return `[${timestamp}] [${info.level}] [${info.environment}] [${info.path}] ${info.message}`;
                })
            )
        });
    }

    public debug(message: string | string[] | undefined, meta: string | string[] | undefined): void {
        if (message && Array.isArray(message)) message = message.join(' ');
        if (meta && Array.isArray(meta)) meta = meta.join(' - ');
        if (!message) message = '';

        this.logger.debug(message, { path: meta });
    }

    public info(message: string | string[] | undefined, meta: string | string[] | undefined): void {
        if (message && Array.isArray(message)) message = message.join(' ');
        if (meta && Array.isArray(meta)) meta = meta.join(' - ');
        if (!message) message = '';

        this.logger.info(message, { path: meta });
    }

    public warn(message: string | string[] | undefined, meta: string | string[] | undefined): void {
        if (message && Array.isArray(message)) message = message.join(' ');
        if (meta && Array.isArray(meta)) meta = meta.join(' - ');
        if (!message) message = '';

        this.logger.warn(message, { path: meta });
    }

    public error(message: string | string[] | undefined, meta: string | string[] | undefined): void {
        if (message && Array.isArray(message)) message = message.join(' ');
        if (meta && Array.isArray(meta)) meta = meta.join(' - ');
        if (!message) message = '';

        this.logger.error(message, { path: meta });
    }
}

export { Logger };