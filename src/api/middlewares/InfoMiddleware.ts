import { NextFunction, Request, Response } from 'express';
import { Server } from '../server';
import { RouteStructure } from '../../structures/RouteStructure';

class InfoMiddleware extends RouteStructure {
    constructor(client: Server) {
        super(client);
    }

    run = (req: Request, res: Response, next: NextFunction) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.localAddress || null;

        this.client.logger.info('IP: ' + ip, 'InfoMiddleware');

        return next();
    };
}

export { InfoMiddleware };