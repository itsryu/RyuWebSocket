import express, { Router } from 'express';
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
    public constructor() {
        super(process.env.PORT);

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
}

export { Server };