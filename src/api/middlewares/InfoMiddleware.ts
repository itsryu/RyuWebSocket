import { NextFunction, Request, Response } from 'express';
import { RouteStructure } from '../../structures';

class InfoMiddleware extends RouteStructure {
    run = (req: Request, _: Response, next: NextFunction) => {
        try {
            const ip = req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? req.connection.remoteAddress;

            this.client.logger.info(`\nRoute: ${req.originalUrl}\nMethod: ${req.method}\nIP: ${ip as string}`, InfoMiddleware.name);

            next();
        } catch (err) {
            this.client.logger.error((err as Error).message, InfoMiddleware.name);
            this.client.logger.warn((err as Error).stack, InfoMiddleware.name);

            next(err);
        }
    };
}

export { 
    InfoMiddleware 
};