import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures/RouteStructure';
import { DiscordGetUserController } from './DiscordGetUserController';
import { get } from 'https';
import { DiscordUser } from '../../types/DiscordInterfaces';
import * as ejs from 'ejs';

class DiscordProfileController extends RouteStructure {
    run = async (req: Request, res: Response) => {
        const { id } = req.params;
        const backgroundColor = req.query.bg ?? '#191919';
        const borderRadius = req.query.border ?? '10px';
        const user = await DiscordGetUserController.getUser(id);

        try {
            if (user) {
                const profileImageUrl = await DiscordProfileController.svgConstructor(user);
                const userNickname = user.user?.username;

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
            }
        } catch (err) {
            this.client.logger.error((err as Error).message, DiscordProfileController.name);
            this.client.logger.warn((err as Error).stack, DiscordProfileController.name);

            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };

    public static svgConstructor(data: DiscordUser) {
        const avatar = data.user?.avatar ?
            `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=4096` :
            'https://cdn.discordapp.com/embed/avatars/0.png?size=4096';

        return new Promise((resolve, reject) => {
            get(avatar, (response) => {
                const chunks: Uint8Array[] = [];
                let contentType: string | null = null;

                response.on('data', (chunk: Uint8Array) => {
                    chunks.push(chunk);
                });

                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    contentType = contentType ?? response.headers['content-type'] ?? 'image/png';
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