import { RESTPostAPIWebhookWithTokenJSONBody, Snowflake } from 'discord-api-types/v10';
import { DiscordUser, SendRateLimitState, WebsocketReceivePayload } from '../types/discordInterfaces';
import { get } from 'https';
import axios from 'axios';
import { Logger } from './logger';

class Util {
    public static async getDiscordUser(id: Snowflake): Promise<DiscordUser | null> {
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
                Logger.error((err as Error).message, [Util.name, Util.getDiscordUser.name]);
                Logger.warn((err as Error).stack, [Util.name, Util.getDiscordUser.name]);

                resolve(null);
            }
        };

        return await new Promise<DiscordUser | null>(fetchUser);
    }

    public static async discordAvatarConstructor(id: string, avatar: string): Promise<string> {
        try {
            const icon = avatar ?
                `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=4096` :
                'https://cdn.discordapp.com/embed/avatars/0.png?size=4096';

            return await new Promise((resolve, reject) => {
                get(icon, (response) => {
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
        } catch (err) {
            Logger.error((err as Error).message, [Util.name, Util.discordAvatarConstructor.name]);
            Logger.warn((err as Error).stack, [Util.name, Util.discordAvatarConstructor.name]);

            return '';
        }
    }

    static getInitialSendRateLimitState(): SendRateLimitState {
        return {
            sent: 0,
            resetAt: Date.now() + 60_000
        };
    }

    static async webhookLog(data: RESTPostAPIWebhookWithTokenJSONBody): Promise<void> {
        await fetch(process.env.WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data, null, 2)
        }).catch((err: unknown) => {
            Logger.error((err as Error).message, 'GatewayUtils');
            Logger.warn((err as Error).stack, 'GatewayUtils');
        });
    }

    static payloadData(payload: WebsocketReceivePayload) {
        return JSON.stringify(payload);
    }

    public static get randomId(): string {
        return Math.random().toString(36).substring(7);
    }
}

export { Util };