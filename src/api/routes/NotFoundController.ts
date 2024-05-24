import { Request, Response } from 'express';
import { Server } from '../server';
import { RouteStructure } from '../../structures/RouteStructure';

class NotFoundController extends RouteStructure { 
    constructor(client: Server) {
        super(client);
    }

    run = (req: Request, res: Response) => {
        res.status(404).json({ code: 404, message: 'Not Found' });
    };
}

export { NotFoundController };