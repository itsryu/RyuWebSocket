import { Request, Response } from 'express';
import { JSONResponse, RouteStructure } from '../../structures/RouteStructure';
import { SpotifyGateway } from '../../spotify';

class SpotifyGetTrackController extends RouteStructure {
    private spotify: SpotifyGateway = new SpotifyGateway(process.env.SPOTIFY_ID, process.env.SPOTIFY_SECRET);

    run = async (req: Request, res: Response) => {
        try {
            const track = await this.spotify.getTrack(req.params.id);

            if (track) {
                res.status(200).json(track);
            } else {
                res.status(404).json(new JSONResponse(404, 'Not Found').toJSON());
            }
        } catch (err) {
            this.client.logger.error((err as Error).message, SpotifyGetTrackController.name);
            this.client.logger.warn((err as Error).stack, SpotifyGetTrackController.name);

            res.status(500).json(new JSONResponse(500, 'Internal Server Error').toJSON());
        }
    };
}

export { SpotifyGetTrackController };