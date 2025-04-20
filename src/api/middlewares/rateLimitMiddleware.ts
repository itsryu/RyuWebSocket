import { NextFunction, Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';
import { Logger } from '../../utils/logger';

interface UserRateInfo {
    hits: number;
    lastRequest: number;
    violations: number;
    blockedUntil?: number;
}

const rateLimitMap: Map<string, UserRateInfo> = new Map();

const RATE_LIMIT = 5; // number of requests allowed in the time window
const TIME_WINDOW_MS = 30 * 1000; // time interval
const BASE_BLOCK_TIME = 30 * 1000; // base time for blocking

class RateLimitMiddleware extends RouteStructure {
    run = (req: Request, res: Response, next: NextFunction) => {
        try {
            const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
            const now = Date.now();

            let userInfo = rateLimitMap.get(ip);

            if (!userInfo) {
                userInfo = {
                    hits: 1,
                    lastRequest: now,
                    violations: 0,
                };
                rateLimitMap.set(ip, userInfo);
                return next();
            }

            if (userInfo.blockedUntil && now < userInfo.blockedUntil) {
                const remaining = ((userInfo.blockedUntil - now) / 1000).toFixed(1);
                return void res
                    .status(429)
                    .json(new JSONResponse(429, `Too many requests. Try again in ${remaining}s.`).toJSON());
            }

            if (now - userInfo.lastRequest > TIME_WINDOW_MS) {
                userInfo.hits = 1;
                userInfo.lastRequest = now;
                return next();
            }

            userInfo.hits++;

            if (userInfo.hits > RATE_LIMIT) {
                userInfo.violations += 1;
                const penaltyTime = BASE_BLOCK_TIME * Math.pow(2, userInfo.violations - 1);
                userInfo.blockedUntil = now + penaltyTime;

                Logger.warn(
                    `IP ${ip} exceeded rate limit. Blocked until ${new Date(userInfo.blockedUntil).toISOString()}`,
                    RateLimitMiddleware.name
                );

                return void res
                    .status(429)
                    .json(
                        new JSONResponse(
                            429,
                            `Rate limit exceeded. You are blocked for ${penaltyTime / 1000} seconds.`
                        ).toJSON()
                    );
            }

            return next();
        } catch (err) {
            Logger.error((err as Error).message, RateLimitMiddleware.name);
            Logger.warn((err as Error).stack, RateLimitMiddleware.name);

            return void res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export {
    RateLimitMiddleware
};
