import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures/RouteStructure';
import { DiscordGetUserController } from './DiscordGetUserController';
import { get } from 'https';
import { DiscordUser } from '../../types/DiscordInterfaces';
import * as ejs from 'ejs';

class DiscordProfileController extends RouteStructure {
    run = async (req: Request, res: Response) => {
        const { id } = req.params;
        const backgroundColor = req.query.bg ?? '#010101';
        const borderRadius = req.query.border ?? '10px';
        const data = await DiscordGetUserController.getUser(id);
        const isValidDiscordId = (id: string): boolean => /^\d{17,19}$/.test(id);

        try {
            if (isValidDiscordId(id)) {
                if (data) {
                    const profileImageUrl = await DiscordProfileController.avatarDataConstructor(data);
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

    public static async avatarDataConstructor(data: DiscordUser): Promise<string> {
        const avatar = data.user?.avatar ?
            `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=4096` :
            'https://cdn.discordapp.com/embed/avatars/0.png?size=4096';

        return await new Promise((resolve, reject) => {
            get(avatar, (response) => {
                const chunks: Uint8Array[] = [];

                response.on('data', (chunk: Uint8Array) => chunks.push(chunk));

                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    const contentType = response.headers['content-type'] ?? 'image/png';
                    const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;

                    resolve(dataUrl);
                });
            }).on('error', (error: Error) => {
                reject(error);
            });
        });
    }
}

export { DiscordProfileController };