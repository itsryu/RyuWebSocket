import { Request, Response } from 'express';
import { Server } from '../server';
import { RouteStructure } from '../../structures/RouteStructure';

class HomeController extends RouteStructure {
    constructor(client: Server) {
        super(client);
    }

    run = (req: Request, res: Response) => {
        res.status(200).json({ code: 200, message: 'Hello, World!' });
    };
}

export { HomeController };