import { Request, Response } from 'express';
import { RouteStructure } from '../../structures/RouteStructure';
import { Server } from '../server';
import { Snowflake } from 'discord-api-types/globals';
import { DiscordUser } from '../../types/DiscordInterfaces';
import axios from 'axios';

class DiscordGetUserController extends RouteStructure {
    constructor(client: Server) {
        super(client);
    }

    run = async (req: Request, res: Response) => {
        const user = await this.getUser(req.params.id);

        if(user) {
            res.status(200).json(user);
        } else {
            res.status(404).json({});
        }
    };

    private getUser = async (id: Snowflake): Promise<DiscordUser | null> => {
        const fetchUser = async (resolve: any) => {
            try {
                const data: DiscordUser = await axios.get(`https://discord.com/api/v10/users/${id}/profile`, {
                    method: 'GET',
                    headers: {
                        Authorization: process.env.USER_TOKEN
                    }
                })
                    .then((res) => res.data)
                    .catch((err) => this.client.logger.error('Error while fetching user profile: ' + err, 'Gateway Message'));

                if(data) {
                    resolve(data);
                } else {
                    resolve(null);
                }

            } catch (err) {
                resolve(null);
            }
        };

        return await new Promise<DiscordUser | null>(fetchUser);
    };
}

export { DiscordGetUserController };