export { };

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CLIENT_TOKEN: string;
      USER_TOKEN: string;
      SPOTIFY_CREDENTIAL_URI: string;
      SPOTIFY_GET_TRACK_URI;
      LOCAL_URL: string;
      DOMAIN_URL: string;
      SPOTIFY_SECRET: string;
      SPOTIFY_ID: string;
      GATEWAY_URL: string;
      WEBHOOK_URL: string;
      GUILD_ID: string;
      USER_ID: string;
      STATE: string
      PORT: number;
    }
  }
}
