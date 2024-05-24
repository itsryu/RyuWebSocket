import axios from 'axios';
import { SpotifyTokenResponse, SpotifyTrackResponse } from './types/SpotifyInterfaces';
import { Client } from './client';

class SpotifyGateway extends Client {
    private id!: string;
    private secret!: string;
    private token!: string | null;

    public constructor(spotifyId: string, spotifySecret: string) {
        super(process.env.PORT);

        this.id = spotifyId;
        this.secret = spotifySecret;
    }

    private async fetchToken(): Promise<string | null> {
        const getToken = async (resolve: any) => {
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
                    resolve(response.data.access_token);
                } else {
                    resolve(null);
                }
            } catch (err) {
                resolve(null);
            }
        };

        return await new Promise<string | null>(getToken);
    }

    public async getTrack(trackId: string): Promise<SpotifyTrackResponse | null> {
        if(!this.token) this.token = await this.fetchToken();

        const getTrack = async (resolve: any) => {
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
                resolve(null);
            }
        };
            
        return await new Promise<SpotifyTrackResponse | null>(getTrack);
    }
}

export { SpotifyGateway };