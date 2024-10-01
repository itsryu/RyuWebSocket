import { NextFunction, Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures/RouteStructure';

class AuthMiddleware extends RouteStructure {
    run = (req: Request, res: Response, next: NextFunction) => {
        const auth = req.headers.authorization;
        const [bearer, token] = auth?.length ? (auth.split(' ')) : ['Bearer', ''];
        const allowedPaths = ['/', '/health', '/profile/:id', '*'];

        try {
            if (allowedPaths.some((path) => {
                if (path.includes(':id')) {
                    const regex = new RegExp(path.replace(':id', '\\d+'));
                    return regex.test(req.originalUrl);
                } else {
                    return req.originalUrl === path;
                }
            })) {
                next();
            } else if (!token) {
                return void res.status(400).json(new JSONResponse(400, 'Bad Request').toJSON());
            } else if (bearer !== 'Bearer' || token !== process.env.AUTH_KEY) {
                this.client.logger.warn(`Invalid authorization key used: ${token}`, AuthMiddleware.name);
                return void res.status(401).json(new JSONResponse(401, 'Unauthorized').toJSON());
            } else {
                this.client.logger.info('Valid authorization key used: ******************', AuthMiddleware.name);
                next();
            }
        } catch (err) {
            this.client.logger.error((err as Error).message, AuthMiddleware.name);
            this.client.logger.warn((err as Error).stack, AuthMiddleware.name);

            return void res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export { AuthMiddleware };