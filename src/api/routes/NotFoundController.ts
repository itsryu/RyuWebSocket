import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures/RouteStructure';

class NotFoundController extends RouteStructure {
    run = (_: Request, res: Response) => {
        try {
            res.status(404).json(new JSONResponse(404, 'Not Found').toJSON());
        } catch (err) {
            this.client.logger.error((err as Error).message, NotFoundController.name);
            this.client.logger.warn((err as Error).stack, NotFoundController.name);

            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export { NotFoundController };