import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';
import { Util } from '../../utils/util';
import { Logger } from '../../utils/logger';
import { SVGBuilder } from '../../build/svg_builder';
import { GatewayOpcodes } from 'discord-api-types/v10';
import { Client } from '../../client';

class DiscordProfileRoute extends RouteStructure {
    run = async (req: Request, res: Response): Promise<void> => {
        const { id } = req.params;
        const backgroundColor = req.query.bg?.toString() ?? '#010101';
        const borderRadius = req.query.border?.toString() ?? '10px';
        const data = await Util.getDiscordUserProfile(id);
        const isValidDiscordId = (id: string): boolean => /^\d{17,19}$/.test(id);

        try {
            if (isValidDiscordId(id)) {
                if (data) {
                    await this.client.gateway?.send({
                        op: GatewayOpcodes.RequestGuildMembers,
                        d: {
                            guild_id: process.env.GUILD_ID,
                            user_ids: [id],
                            presences: true,
                            limit: 0
                        }
                    });

                    const member = await Client.guildMemberPresenceData.get(data.user.id);

                    const svg = await SVGBuilder.createProfileCard({
                        backgroundColor,
                        borderRadius,
                        data,
                        member
                    });
                    const resLength = Buffer.byteLength(svg.toString());

                    if (Buffer.byteLength(svg.toString()) > 3000000) {
                        return void res.status(413).json(new JSONResponse(413, 'SVG too large').toJSON());
                    }

                    return void res
                        .status(200)
                        .header('Content-Type', 'image/svg+xml')
                        .header('Content-Length', resLength.toString())
                        .header('Cache-Control', "no-cache, no-store, must-revalidate, max-age=1")
                        .header("Pragma", "no-cache")
                        .header("Expires", "0")
                        .header('content-security-policy', "default-src 'none'; img-src * data:; style-src 'unsafe-inline'")
                        .header('CDN-Cache-Control', 'no-store')
                        .send(svg);
                } else {
                    return void res.status(404).json(new JSONResponse(404, 'User not found').toJSON());
                }
            }
        } catch (err) {
            Logger.error((err as Error).message, DiscordProfileRoute.name);
            return void res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export {
    DiscordProfileRoute
};