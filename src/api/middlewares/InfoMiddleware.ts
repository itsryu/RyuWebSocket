import { NextFunction, Request, Response } from 'express';
import { RouteStructure } from '../../structures/RouteStructure';
import { Server } from '../server';

class InfoMiddleware extends RouteStructure {
    constructor(client: Server) {
        super(client);
    }

    run = (req: Request, _: Response, next: NextFunction) => {
        const ip = req.headers['x-forwarded-for'] || req.socket.localAddress || null;

        this.client.logger.info('IP: ' + ip, 'InfoMiddleware');

        next();
    };
}

export { InfoMiddleware };