import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';

class HealthCheckController extends RouteStructure {
    run = (_: Request, res: Response) => {
        try {
            return void res.status(200).json(new JSONResponse(200, 'OK').toJSON());
        } catch (err) {
            this.client.logger.error((err as Error).message, HealthCheckController.name);
            this.client.logger.warn((err as Error).stack, HealthCheckController.name);

            return void res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export { 
    HealthCheckController 
};