export { };

declare module 'useragent';

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly CLIENT_TOKEN: string;
      readonly USER_TOKEN: string;
      readonly AUTH_KEY: string;
      readonly SPOTIFY_CREDENTIAL_URI: string;
      readonly SPOTIFY_GET_TRACK_URI: string;
      readonly LOCAL_URL: string;
      readonly DOMAIN_URL: string;
      readonly SPOTIFY_SECRET: string;
      readonly SPOTIFY_ID: string;
      readonly GATEWAY_URL: string;
      readonly WEBHOOK_URL: string;
      readonly GUILD_ID: string;
      readonly USER_ID: string;
      readonly STATE: string
      readonly PORT: string;
    }
  }
}
