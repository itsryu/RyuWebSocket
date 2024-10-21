import * as winston from 'winston';
import { config } from 'dotenv';

config();

class Logger {
    private static environment: string = process.env.STATE ?? 'development';

    private static readonly levels: winston.config.AbstractConfigSetLevels = {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        silly: 6
    };

    private static readonly logger: winston.Logger = winston.createLogger({
        level: 'info',
        levels: Logger.levels,
        defaultMeta: { environment: Logger.environment },
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

    public static debug(message: string | string[] | undefined, meta: string | string[] | undefined): void {
        if (message && Array.isArray(message)) message = message.join(' ');
        if (meta && Array.isArray(meta)) meta = meta.join(' - ');
        if (!message) message = '';

        Logger.logger.debug(message, { path: meta });
    }

    public static info(message: string | string[] | undefined, meta: string | string[] | undefined): void {
        if (message && Array.isArray(message)) message = message.join(' ');
        if (meta && Array.isArray(meta)) meta = meta.join(' - ');
        if (!message) message = '';

        Logger.logger.info(message, { path: meta });
    }

    public static warn(message: string | string[] | undefined, meta: string | string[] | undefined): void {
        if (message && Array.isArray(message)) message = message.join(' ');
        if (meta && Array.isArray(meta)) meta = meta.join(' - ');
        if (!message) message = '';

        Logger.logger.warn(message, { path: meta });
    }

    public static error(message: string | string[] | undefined, meta: string | string[] | undefined): void {
        if (message && Array.isArray(message)) message = message.join(' ');
        if (meta && Array.isArray(meta)) meta = meta.join(' - ');
        if (!message) message = '';

        Logger.logger.error(message, { path: meta });
    }
}

export { Logger };