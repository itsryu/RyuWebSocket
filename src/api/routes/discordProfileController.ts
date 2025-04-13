import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';
import * as ejs from 'ejs';
import { Util } from '../../utils/util';
import { Logger } from '../../utils/logger';
import { MemberPresence, WebsocketReceivePayload } from '../../types';

const statusColors = {
    online: '#23a55a',
    dnd: '#f23f43',
    idle: '#f0b132',
    invisible: '#82858f',
    offline: '#82858f'
};

class DiscordProfileController extends RouteStructure {
    run = async (req: Request, res: Response) => {
        const { id } = req.params;
        const backgroundColor = req.query.bg ?? '#010101';
        const borderRadius = req.query.border ?? '10px';
        const data = await Util.getDiscordUserProfile(id);
        const isValidDiscordId = (id: string): boolean => /^\d{17,19}$/.test(id);

        try {
            if (isValidDiscordId(id)) {
                if (data) {
                    const userAvatar = await Util.discordAvatarConstructor(data.user.id, data.user.avatar);
                    const userNickname = data.user?.username;
                    const guildMemberRaw = this.client.gatewayGuildMemberData?.get(data.user.id);
                    const receivePayload: WebsocketReceivePayload | null = guildMemberRaw ? JSON.parse(guildMemberRaw) as WebsocketReceivePayload : null;

                    if (!receivePayload) {
                        return void res.status(404).json(new JSONResponse(404, 'Guild member not found').toJSON());
                    }

                    const memberPresence = receivePayload.d as MemberPresence;
                    const memberStatus = memberPresence?.status ? statusColors[memberPresence.status] : statusColors.offline;
                    const memberActivities = memberPresence?.activities ?? [];

                    ejs.renderFile('./views/svg.ejs', {
                        backgroundColor,
                        borderRadius,
                        userAvatar,
                        userNickname,
                        memberStatus,
                        memberActivities
                    }, (err, svg) => {
                        if (err) {
                            Logger.error(err.message, DiscordProfileController.name);
                            Logger.warn(err.stack, DiscordProfileController.name);

                            return void res.status(500).send(new JSONResponse(500, 'Internal Server Error').toJSON());
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
            Logger.error((err as Error).message, DiscordProfileController.name);
            Logger.warn((err as Error).stack, DiscordProfileController.name);

            return void res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export {
    DiscordProfileController
};