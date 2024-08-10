import { Request, Response } from 'express';
import { RouteStructure } from '../../structures/RouteStructure';
import { Server } from '../server';

class HomeController extends RouteStructure {
    constructor(client: Server) {
        super(client);
    }

    run = (_: Request, res: Response) => {
        res.status(200).json({ code: 200, message: 'Hello, World!' });
    };
}

export { HomeController };