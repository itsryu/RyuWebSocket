import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';
import { Logger } from '../../utils/logger';

class HomeController extends RouteStructure {
    run = (_: Request, res: Response) => {
        try {
            res.status(200).json(new JSONResponse(200, 'Welcome to Ryu API!').toJSON());
        } catch (err) {
            Logger.error((err as Error).message, HomeController.name);
            Logger.warn((err as Error).stack, HomeController.name);
            
            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export { 
    HomeController 
};