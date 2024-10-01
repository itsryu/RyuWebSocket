import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures/routeStructure';

class HomeController extends RouteStructure {
    run = (_: Request, res: Response) => {
        try {
            res.status(200).json(new JSONResponse(200, 'Hello, World!').toJSON());
        } catch (err) {
            this.client.logger.error((err as Error).message, HomeController.name);
            this.client.logger.warn((err as Error).stack, HomeController.name);
            
            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export { HomeController };