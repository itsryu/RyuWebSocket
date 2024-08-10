import { Request, Response } from 'express';
import { RouteStructure } from '../../structures/RouteStructure';
import { SpotifyGateway } from '../../spotify';
import { Server } from '../server';

class SpotifyGetTrackController extends RouteStructure {
    private spotify: SpotifyGateway = new SpotifyGateway(process.env.SPOTIFY_ID, process.env.SPOTIFY_SECRET);

    constructor(client: Server) {
        super(client);
    }

    run = async (req: Request, res: Response) => {
        const track = await this.spotify.getTrack(req.params.id);

        if (track) {
            res.status(200).json(track);
        } else {
            res.status(404).json({ code: 404, message: 'Track not found' });
        }
    };
}

export { SpotifyGetTrackController };