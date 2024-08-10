import { Request, Response } from 'express';
import { RouteStructure } from '../../structures/RouteStructure';
import { Server } from '../server';

class NotFoundController extends RouteStructure { 
    constructor(client: Server) {
        super(client);
    }

    run = (_: Request, res: Response) => {
        res.status(404).json({ code: 404, message: 'Not Found' });
    };
}

export { NotFoundController };