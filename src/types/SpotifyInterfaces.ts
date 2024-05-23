export enum SpotifyEvents {
    GetTrack = 'GET_TRACK'
}

export interface SpotifyTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

interface Artist {
    external_urls: {
        spotify: string;
    };
    href: string;
    id: string;
    name: string;
    type: string;
    uri: string;
}

interface Image {
    height: number;
    url: string;
    width: number;
}

interface Album {
    album_group: string;
    album_type: string;
    artists: Artist[];
    available_markets: string[];
    external_urls: {
        spotify: string;
    };
    href: string;
    id: string;
    images: Image[];
    name: string;
    release_date: string;
    release_date_precision: string;
    total_tracks: number;
    type: string;
    uri: string;
}

export interface SpotifyTrackResponse {
    id: string;
    name: string;
    artists: Artist[];
    album: Album
    external_urls: {
        spotify: string;
    };
    href: string;
    popularity: number;
    preview_url: string;
    track_number: number;
    duration_ms: number;
    type: string;
    uri: string;
}