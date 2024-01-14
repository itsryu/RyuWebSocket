export { };

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GATEWAY_URL: string;
      WEBHOOK_URL: string;
      CLIENT_TOKEN: string;
      USER_TOKEN: string;
      GUILD_ID: string;
      USER_ID: string;
      STATE: string
      PORT: number;
    }
  }
}
