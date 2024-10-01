import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures/routeStructure';
import * as ejs from 'ejs';
import { Util } from '../../utils/util';

class DiscordProfileController extends RouteStructure {
    run = async (req: Request, res: Response) => {
        const { id } = req.params;
        const backgroundColor = req.query.bg ?? '#010101';
        const borderRadius = req.query.border ?? '10px';
        const data = await Util.getDiscordUser(id);
        const isValidDiscordId = (id: string): boolean => /^\d{17,19}$/.test(id);

        try {
            if (isValidDiscordId(id)) {
                if (data) {
                    const profileImageUrl = await Util.discordAvatarConstructor(data.user.id, data.user.avatar);
                    const userNickname = data.user?.username;

                    ejs.renderFile('./views/svg.ejs', { backgroundColor, borderRadius, profileImageUrl, userNickname }, (err, svg) => {
                        if (err) {
                            return res.status(500).send(new JSONResponse(500, 'Internal Server Error').toJSON());
                        } else {
                            res.writeHead(200, {
                                'Content-Type': 'image/svg+xml',
                                'Content-Length': svg.length
                            });

                            res.end(svg);
                        }
                    });
                } else {
                    return void res.status(404).json(new JSONResponse(404, 'User not found').toJSON());
                }
            } else {
                return void res.status(400).json(new JSONResponse(400, 'Invalid Discord ID').toJSON());
            }
        } catch (err) {
            this.client.logger.error((err as Error).message, DiscordProfileController.name);
            this.client.logger.warn((err as Error).stack, DiscordProfileController.name);

            return void res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export { DiscordProfileController };