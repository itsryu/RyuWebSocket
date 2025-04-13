import * as winston from 'winston';
import { config } from 'dotenv';

config();

enum LogLevel {
    ERROR,
    WARN,
    INFO,
    HTTP,
    VERBOSE,
    DEBUG,
    SILLY
}

class Logger {
    private static environment: string = process.env.STATE ?? 'development';

    private static readonly levels: winston.config.AbstractConfigSetLevels = {
        error: LogLevel.ERROR,
        warn: LogLevel.WARN,
        info: LogLevel.INFO,
        http: LogLevel.HTTP,
        verbose: LogLevel.VERBOSE,
        debug: LogLevel.DEBUG,
        silly: LogLevel.SILLY
    };

    private static readonly logger: winston.Logger = winston.createLogger({
        level: 'debug',
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
                all: true
            }),
            winston.format.align(),
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