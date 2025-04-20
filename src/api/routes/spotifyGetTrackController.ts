import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures';
import { SpotifyTokenResponse, SpotifyTrackResponse } from '../../@types/spotifyInterfaces';
import axios from 'axios';
import { Logger } from '../../utils/logger';

class SpotifyGetTrackController extends RouteStructure {;
    private static token: string | null = null;
    private static expiresAt: number | null = null;

    run = async (req: Request, res: Response) => {
        const id = req.params.id;

        try {
            const track = await SpotifyGetTrackController.getTrack(id);

            if (track) {
                res.status(200).json(track);
            } else {
                res.status(404).json(new JSONResponse(404, 'Not Found').toJSON());
            }
        } catch (err) {
            Logger.error((err as Error).message, SpotifyGetTrackController.name);
            Logger.warn((err as Error).stack, SpotifyGetTrackController.name);

            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };

    private static async fetchToken(): Promise<string | null> {
        const now = Date.now();

        if (SpotifyGetTrackController.token && SpotifyGetTrackController.expiresAt && now < SpotifyGetTrackController.expiresAt) {
            return SpotifyGetTrackController.token;
        } else {
            const getToken = async (resolve: (V: string | null) => void) => {
                try {
                    const form = new URLSearchParams();
                    form.append('grant_type', 'client_credentials');

                    const response = await axios.post<SpotifyTokenResponse | null>(process.env.SPOTIFY_CREDENTIAL_URI, form, {
                        headers: {
                            Authorization: 'Basic ' + (Buffer.from(process.env.SPOTIFY_ID + ':' +  process.env.SPOTIFY_SECRET).toString('base64')),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        withCredentials: true
                    });

                    if (response.data) {
                        SpotifyGetTrackController.expiresAt = now + response.data.expires_in * 1000;
                        SpotifyGetTrackController.token = response.data.access_token;

                        resolve(SpotifyGetTrackController.token);
                    } else {
                        resolve(null);
                    }
                } catch (err) {
                    Logger.error((err as Error).message, [SpotifyGetTrackController.name, SpotifyGetTrackController.fetchToken.name]);
                    Logger.warn((err as Error).stack, [SpotifyGetTrackController.name, SpotifyGetTrackController.fetchToken.name]);

                    resolve(null);
                }
            };

            return await new Promise<string | null>(getToken);
        }
    }

    public static async getTrack(trackId: string): Promise<SpotifyTrackResponse | null> {
        const token = await SpotifyGetTrackController.fetchToken();

        const getTrack = async (resolve: (V: SpotifyTrackResponse | null) => void) => {
            try {
                const response = await axios.get<SpotifyTrackResponse | null>(process.env.SPOTIFY_GET_TRACK_URI + '/' + trackId, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data) {
                    resolve(response.data);
                } else {
                    resolve(null);
                }
            } catch (err) {
                Logger.error((err as Error).message, [SpotifyGetTrackController.name, SpotifyGetTrackController.getTrack.name]);
                Logger.warn((err as Error).stack, [SpotifyGetTrackController.name, SpotifyGetTrackController.getTrack.name]);

                resolve(null);
            }
        };

        return await new Promise<SpotifyTrackResponse | null>(getTrack);
    }
}

export { 
    SpotifyGetTrackController 
};