import { GatewayGuildMembersChunkDispatchData, GatewayIntentBits, GatewayPresenceUpdateDispatchData } from 'discord-api-types/v10';

export interface ClientOptions {
  intents: GatewayIntentBits[]
}

export interface MemberPresence extends GatewayPresenceUpdateDispatchData, GatewayGuildMembersChunkDispatchData {}