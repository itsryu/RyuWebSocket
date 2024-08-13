import axios from 'axios';
import { SpotifyRefreshTokenResponse, SpotifyTokenResponse, SpotifyTrackResponse } from './types/SpotifyInterfaces';
import { Base } from './base';

class SpotifyGateway extends Base {
    private id!: string;
    private secret!: string;
    private token: string | null = null;
    private expiresAt: number | null = null;

    public constructor(spotifyId: string, spotifySecret: string) {
        super();

        this.id = spotifyId;
        this.secret = spotifySecret;
    }

    private async fetchToken(): Promise<string | null> {
        const now = Date.now();

        if (this.token && this.expiresAt && now < this.expiresAt) {
            return this.token;
        } else {
            const getToken = async (resolve: (V: string | null) => void) => {
                try {
                    const form = new URLSearchParams();
                    form.append('grant_type', 'client_credentials');

                    const response = await axios.post<SpotifyTokenResponse | null>(process.env.SPOTIFY_CREDENTIAL_URI, form, {
                        headers: {
                            Authorization: 'Basic ' + (Buffer.from(this.id + ':' + this.secret).toString('base64')),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        withCredentials: true
                    });

                    if (response.data && response.data.access_token) {
                        this.expiresAt = now + response.data.expires_in * 1000;

                        resolve(response.data.access_token);
                    } else {
                        resolve(null);
                    }
                } catch (err) {
                    this.logger.error((err as Error).message, [SpotifyGateway.name, this.fetchToken.name]);
                    this.logger.warn((err as Error).stack, [SpotifyGateway.name, this.fetchToken.name]);

                    resolve(null);
                }
            };

            return await new Promise<string | null>(getToken);
        }
    }

    private async refreshToken(refresh_token: string) {
        this.token = await this.fetchToken();

        const refresh = async (resolve: (V: SpotifyRefreshTokenResponse | null) => void) => {
            try {
                const form = new URLSearchParams();
                form.append('grant_type', 'client_credentials');
                form.append('refresh_token', refresh_token);

                const request = await axios.post<SpotifyRefreshTokenResponse>(process.env.SPOTIFY_CREDENTIAL_URI, form, {
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + (Buffer.from(this.id + ':' + this.secret).toString('base64'))
                    },
                    withCredentials: true
                })

                if(request && request.data) {
                    resolve(request.data);
                } else {
                    resolve(null);
                }
            } catch (err) {
                this.logger.error((err as Error).message, [SpotifyGateway.name, this.refreshToken.name]);
                this.logger.warn((err as Error).stack, [SpotifyGateway.name, this.refreshToken.name]);

                resolve(null);
            }
        }

        return await new Promise<SpotifyRefreshTokenResponse | null>(refresh);
    }

    public async getTrack(trackId: string): Promise<SpotifyTrackResponse | null> {
        this.token = await this.fetchToken();

        const getTrack = async (resolve: (V: SpotifyTrackResponse | null) => void) => {
            try {
                const response = await axios.get<SpotifyTrackResponse | null>(process.env.SPOTIFY_GET_TRACK_URI + '/' + trackId, {
                    headers: {
                        Authorization: `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data && response.data.id) {
                    resolve(response.data);
                } else {
                    resolve(null);
                }
            } catch (err) {
                this.logger.error((err as Error).message, [SpotifyGateway.name, this.getTrack.name]);
                this.logger.warn((err as Error).stack, [SpotifyGateway.name, this.getTrack.name]);

                resolve(null);
            }
        };

        return await new Promise<SpotifyTrackResponse | null>(getTrack);
    }
}

export { SpotifyGateway };