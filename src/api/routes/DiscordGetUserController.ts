import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures/routeStructure';
import { Util } from '../../utils/util';

class DiscordGetUserController extends RouteStructure {
    run = async (req: Request, res: Response) => {
        try {
            const user = await Util.getDiscordUser(req.params.id);

            if (user) {
                res.status(200).json(user);
            } else {
                res.status(404).json({});
            }
        } catch (err) {
            this.client.logger.error((err as Error).message, DiscordGetUserController.name);
            this.client.logger.warn((err as Error).stack, DiscordGetUserController.name);

            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export { DiscordGetUserController };