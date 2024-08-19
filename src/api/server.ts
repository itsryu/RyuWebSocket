import express, { Router } from 'express';
import { Client } from '../client';
import cors from 'cors';
import { join } from 'node:path';
import { RouteStructure } from '../structures/RouteStructure';
import { AuthMiddleware, InfoMiddleware } from './middlewares/index';
import { NotFoundController, HomeController, SpotifyGetTrackController, DiscordGetUserController, HealthCheckController, DiscordProfileController } from './routes/index';

interface Route {
    method: string;
    path: string;
    handler: RouteStructure;
};

class Server extends Client {
    public constructor() {
        super();

        this.config();
    }

    private config(): void {
        this.app.set('view engine', 'ejs');
        this.app.set('views', join(__dirname, '../views'));
        this.app.use(express.static(join(__dirname, '../public')));
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
                    router.get(path, new InfoMiddleware(this).run, new AuthMiddleware(this).run, handler.run.bind(handler));
                    break;
                case 'POST':
                    router.post(path, new InfoMiddleware(this).run, new AuthMiddleware(this).run, handler.run.bind(handler));
                    break;
                default:
                    break;
            }
        });

        return router;
    }

    private loadRoutes(): Route[] {
        const routes: Route[] = [
            { method: 'GET', path: '/', handler: new HomeController(this) },
            { method: 'GET', path: '/health', handler: new HealthCheckController(this) },
            { method: 'GET', path: '/discord/user/:id', handler: new DiscordGetUserController(this) },
            { method: 'GET', path: '/spotify/track/:id', handler: new SpotifyGetTrackController(this) },
            { method: 'GET', path: '/profile/:id', handler: new DiscordProfileController(this) },
            { method: 'GET', path: '*', handler: new NotFoundController(this) }
        ];

        return routes;
    }
}

export { Server };