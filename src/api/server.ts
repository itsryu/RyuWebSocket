import express, { Express, Router } from 'express';
import { Client } from '../client';
import cors from 'cors';
import { RouteStructure } from '../structures/RouteStructure';
import { InfoMiddleware } from './middlewares/index';
import { NotFoundController, HomeController, SpotifyGetTrackController, DiscordGetUserController } from './routes/index';
interface Route {
    method: string;
    path: string;
    handler: RouteStructure;
};

class Server extends Client {
    public app: Express = express();
    private port: number;

    public constructor(port: number) {
        super();

        this.port = port;

        this.config();
    }

    private config(): void {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(this.initRoutes());
    }

    private initRoutes(): Router {
        const router = Router();
        const routes = this.loadRoutes();

        routes.forEach((route) => {
            const { method, path, handler } = route;

            switch (method) {
                case 'GET':
                    router.get(path, new InfoMiddleware(this).run, handler.run);
                    break;
                case 'POST':
                    router.post(path, new InfoMiddleware(this).run, handler.run);
                    break;
                default:
                    break;
            }
        });

        router.get('*', new NotFoundController(this).run);

        return router;
    }

    private loadRoutes(): Array<Route> {
        const routes: Array<Route> = [
            { method: 'GET', path: '/', handler: new HomeController(this) },
            { method: 'GET', path: '/discord/user/:id', handler: new DiscordGetUserController(this)},
            { method: 'GET', path: '/spotify/track/:id', handler: new SpotifyGetTrackController(this) }
        ];

        return routes;
    }

    public listen() {
        this.app.listen(this.port, () => {
            this.logger.info(`Server is running at ${process.env.STATE == 'development' ? `${process.env.LOCAL_URL}:${this.port}/` : `${process.env.DOMAIN_URL}`}`, 'Server');
        });
    }
}

export { Server };