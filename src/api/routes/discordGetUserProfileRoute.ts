import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';
import { Util } from '../../utils/util';
import { Logger } from '../../utils/logger';

class DiscordGetUserProfileRoute extends RouteStructure {
    run = async (req: Request, res: Response) => {
        try {
            const user = await Util.getDiscordUserProfile(req.params.id);

            if (user) {
                res.status(200).json(user);
            } else {
                res.status(404).json({});
            }
        } catch (err) {
            Logger.error((err as Error).message, DiscordGetUserProfileRoute.name);
            Logger.warn((err as Error).stack, DiscordGetUserProfileRoute.name);

            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export {
    DiscordGetUserProfileRoute
};