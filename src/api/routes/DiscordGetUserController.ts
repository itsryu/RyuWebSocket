import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures/RouteStructure';
import { Snowflake } from 'discord-api-types/globals';
import { DiscordUser } from '../../types/DiscordInterfaces';
import axios from 'axios';

class DiscordGetUserController extends RouteStructure {
    run = async (req: Request, res: Response) => {
        try {
            const user = await this.getUser(req.params.id);

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

    private async getUser(id: Snowflake): Promise<DiscordUser | null> {
        const fetchUser = async (resolve: (V: DiscordUser | null) => void) => {
            try {
                const data: DiscordUser | undefined = await axios.get(`https://discord.com/api/v10/users/${id}/profile`, {
                    method: 'GET',
                    headers: {
                        Authorization: process.env.USER_TOKEN
                    }
                })
                    .then((res) => res.data as DiscordUser)
                    .catch(() => undefined);

                if (data) {
                    resolve(data);
                } else {
                    resolve(null);
                }

            } catch (err) {
                this.client.logger.error((err as Error).message, DiscordGetUserController.name);
                this.client.logger.warn((err as Error).stack, DiscordGetUserController.name);

                resolve(null);
            }
        };

        return await new Promise<DiscordUser | null>(fetchUser);
    }
}

export { DiscordGetUserController };