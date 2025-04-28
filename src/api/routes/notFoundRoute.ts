import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';
import { Logger } from '../../utils/logger';

class NotFoundRoute extends RouteStructure {
    run = (_: Request, res: Response) => {
        try {
            res.status(404).json(new JSONResponse(404, 'Not Found').toJSON());
        } catch (err) {
            Logger.error((err as Error).message, NotFoundRoute.name);
            Logger.warn((err as Error).stack, NotFoundRoute.name);

            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export { 
    NotFoundRoute 
};