import express, { Router } from 'express';
import cors from 'cors'; // Import the CORS middleware
import { Client } from '../client';
import { join } from 'node:path';
import { RouteStructure } from '../structures/routeStructure';
import { AuthMiddleware, InfoMiddleware, RateLimitMiddleware } from './middlewares/index';
import { AuthRoute, DiscordGetUserProfileRoute, DiscordProfileRoute, HealthCheckRoute, HomeRoute, NotFoundRoute, SpotifyGetTrackRoute } from './routes/index';

interface Route {
    method: 'get' | 'post' | 'delete' | 'put' | 'patch' | 'options' | 'head';
    path: string;
    handler: RouteStructure;
};

class Server extends Client {
    public constructor() {
        super();

        this.config();
    }

    private config(): void {
        this.app.set('view engine', 'html');
        this.app.set('trust proxy', true);
        this.app.use(cors()); // Enable CORS
        this.app.use(express.static(join(__dirname, '../public')));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(this.initRoutes());
        this.app.use((req, res) => { new NotFoundRoute(this).run(req, res); });
    }

    private initRoutes(): Router {
        const router = Router();
        const routes = this.loadRoutes();

        routes.forEach((route) => {
            const { method, path, handler } = route;

            switch (method) {
                case 'get':
                    router.get(path, new RateLimitMiddleware(this).run, new InfoMiddleware(this).run, new AuthMiddleware(this).run, handler.run.bind(handler));
                    break;
                case 'post':
                    router.post(path, new RateLimitMiddleware(this).run, new InfoMiddleware(this).run, new AuthMiddleware(this).run, handler.run.bind(handler));
                    break;
                default:
                    break;
            }
        });

        return router;
    }

    private loadRoutes(): Route[] {
        const routes: Route[] = [
            { method: 'get', path: '/', handler: new HomeRoute(this) },
            { method: 'get', path: '/health', handler: new HealthCheckRoute(this) },
            { method: 'get', path: '/discord/user/:id', handler: new DiscordGetUserProfileRoute(this) },
            { method: 'get', path: '/discord/user/profile/:id', handler: new DiscordGetUserProfileRoute(this) },
            { method: 'get', path: '/spotify/track/:id', handler: new SpotifyGetTrackRoute(this) },
            { method: 'get', path: '/profile/:id', handler: new DiscordProfileRoute(this) },
            { method: 'post', path: '/auth', handler: new AuthRoute(this)}
        ];

        return routes;
    }
}

export { Server };