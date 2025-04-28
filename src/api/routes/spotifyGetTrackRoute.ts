import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';
import { SpotifyTokenResponse, SpotifyTrackResponse } from '../../@types/spotifyInterfaces';
import axios from 'axios';
import { Logger } from '../../utils/logger';

class SpotifyGetTrackRoute extends RouteStructure {
    ;
    private static token: string | null = null;
    private static expiresAt: number | null = null;

    run = async (req: Request, res: Response) => {
        const id = req.params.id;

        try {
            const track = await SpotifyGetTrackRoute.getTrack(id);

            if (track) {
                res.status(200).json(track);
            } else {
                res.status(404).json(new JSONResponse(404, 'Not Found').toJSON());
            }
        } catch (err) {
            Logger.error((err as Error).message, SpotifyGetTrackRoute.name);
            Logger.warn((err as Error).stack, SpotifyGetTrackRoute.name);

            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };

    private static async fetchToken(): Promise<string | null> {
        const now = Date.now();

        if (SpotifyGetTrackRoute.token && SpotifyGetTrackRoute.expiresAt && now < SpotifyGetTrackRoute.expiresAt) {
            return SpotifyGetTrackRoute.token;
        } else {
            const getToken = async (resolve: (V: string | null) => void) => {
                try {
                    const form = new URLSearchParams();
                    form.append('grant_type', 'client_credentials');

                    const response = await axios.post<SpotifyTokenResponse | null>(process.env.SPOTIFY_CREDENTIAL_URI, form, {
                        headers: {
                            Authorization: 'Basic ' + (Buffer.from(process.env.SPOTIFY_ID + ':' + process.env.SPOTIFY_SECRET).toString('base64')),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        withCredentials: true
                    })
                        .catch(() => null)

                    if (response && response.data) {
                        SpotifyGetTrackRoute.expiresAt = now + response.data.expires_in * 1000;
                        SpotifyGetTrackRoute.token = response.data.access_token;

                        resolve(SpotifyGetTrackRoute.token);
                    } else {
                        resolve(null);
                    }
                } catch (err) {
                    Logger.error((err as Error).message, [SpotifyGetTrackRoute.name, SpotifyGetTrackRoute.fetchToken.name]);
                    Logger.warn((err as Error).stack, [SpotifyGetTrackRoute.name, SpotifyGetTrackRoute.fetchToken.name]);

                    resolve(null);
                }
            };

            return await new Promise<string | null>(getToken);
        }
    }

    public static async getTrack(trackId: string): Promise<SpotifyTrackResponse | null> {
        const token = await SpotifyGetTrackRoute.fetchToken();

        const getTrack = async (resolve: (V: SpotifyTrackResponse | null) => void) => {
            try {
                const response = await axios.get<SpotifyTrackResponse | null>(process.env.SPOTIFY_GET_TRACK_URI + '/' + trackId, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                })
                    .catch(() => null)

                if (response && response.data) {
                    resolve(response.data);
                } else {
                    resolve(null);
                }
            } catch (err) {
                Logger.error((err as Error).message, [SpotifyGetTrackRoute.name, SpotifyGetTrackRoute.getTrack.name]);
                Logger.warn((err as Error).stack, [SpotifyGetTrackRoute.name, SpotifyGetTrackRoute.getTrack.name]);

                resolve(null);
            }
        };

        return await new Promise<SpotifyTrackResponse | null>(getTrack);
    }
}

export {
    SpotifyGetTrackRoute
};