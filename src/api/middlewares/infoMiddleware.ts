import { NextFunction, Request, Response } from 'express';
import { RouteStructure } from '../../structures';
import { Logger } from '../../utils/logger';

class InfoMiddleware extends RouteStructure {
    run = (req: Request, _: Response, next: NextFunction) => {
        try {
            const ip = req.ip ?? req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? req.connection.remoteAddress;

            Logger.info(`\nRoute: ${req.originalUrl}\nMethod: ${req.method}\nIP: ${ip as string}`, InfoMiddleware.name);

            next();
        } catch (err) {
            Logger.error((err as Error).message, InfoMiddleware.name);
            Logger.warn((err as Error).stack, InfoMiddleware.name);

            next(err);
        }
    };
}

export { 
    InfoMiddleware 
};