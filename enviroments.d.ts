export { };

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GATEWAY_URL: string;
      TOKEN: string;
      GUILD_ID: string;
      USER_ID: string;
      STATE: string
      PORT: number;
    }
  }
}
