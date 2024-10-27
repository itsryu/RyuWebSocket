import { GatewayDispatchEvents, GatewayGuildMembersChunkDispatchData, GatewayIntentBits, GatewayOpcodes, GatewayPresenceUpdateDispatchData, GatewayRequestGuildMembersDataWithUserIds } from 'discord-api-types/v10';
import { WebSocket } from 'ws';
import { SpotifyEvents, SpotifyTrackResponse } from './spotifyInterfaces';

export interface ClientOptions {
  intents: GatewayIntentBits[];
}

export interface MemberPresence extends GatewayPresenceUpdateDispatchData, GatewayGuildMembersChunkDispatchData {
  data: DiscordUser | undefined;
}

export enum WebSocketState {
  Connected = 'Connected',
  Disconnected = 'Disconnected',
  Reconnecting = 'Reconnecting',
  Heartbeat = 'Heartbeat',
}

export type WebSocketReceivePayloadEvents = SpotifyEvents | GatewayDispatchEvents | WebSocketState;

export enum WebsocketOpcodes {
  Connected = 100,
  Disconnected = 101,
  Reconnecting = 102,
  Heartbeat = 103,
}

export interface WebsocketReceivePayload {
  op: GatewayOpcodes | WebsocketOpcodes | null;
  d?: SpotifyTrackResponse | MemberPresence | GatewayRequestGuildMembersDataWithUserIds | null;
  t?: WebSocketReceivePayloadEvents | null;
}

interface ConnectedAccount {
  type: string;
  id: string;
  name: string;
  verified: boolean;
  metadata?: {
    game_count?: string;
    item_count_dota2?: string;
    item_count_tf2?: string;
    verified?: string;
    followers_count?: string;
    statuses_count?: string;
    created_at?: string;
  };
}

interface User {
  id: string;
  username: string;
  global_name: string;
  avatar: string;
  avatar_decoration_data: any;
  discriminator: string;
  public_flags: number;
  flags: number;
  banner: string;
  banner_color: string;
  accent_color: number;
  bio: string;
}

interface UserProfile {
  bio: string;
  accent_color: number;
  pronouns: string;
  profile_effect: any;
  banner: string;
  theme_colors: number[];
  popout_animation_particle_type: any;
  emoji: any;
}

interface UserBadges {
  id: string;
  description: string;
  icon: string;
  link: string;
}

interface MutualGuild {
  id: string;
  nick: string | null;
}

export interface DiscordUser {
  user: User;
  connected_accounts: ConnectedAccount[];
  premium_since: string;
  premium_type: number;
  premium_guild_since: string;
  profile_themes_experiment_bucket: number;
  user_profile: UserProfile;
  badges: UserBadges[];
  guild_badges: any[];
  mutual_guilds: MutualGuild[];
  legacy_username: string;
}

export enum WebSocketShardDestroyRecovery {
  Reconnect,
  Resume,
}

export interface WebSocketShardDestroyOptions {
  code?: number;
  reason?: string;
  recover?: WebSocketShardDestroyRecovery;
}

export enum WebSocketShardEvents {
  Closed = 'closed',
  Debug = 'debug',
  Dispatch = 'dispatch',
  Error = 'error',
  HeartbeatComplete = 'heartbeat',
  Hello = 'hello',
  Ready = 'ready',
  Resumed = 'resumed',
  SocketError = 'socketError',
}

export enum WebSocketShardStatus {
  Idle,
  Connecting,
  Resuming,
  Ready,
}

export enum CloseCodes {
  Normal = 1_000,
  Resuming = 4_200,
}

export const ImportantGatewayOpcodes = new Set(
  [
    GatewayOpcodes.Heartbeat,
    GatewayOpcodes.Identify,
    GatewayOpcodes.Resume
  ]
);

export interface SendRateLimitState {
  resetAt: number;
  sent: number;
}

export interface WebSocketUser {
  id: string;
  ip: string | string[] | undefined;
  isAlive: boolean;
  pingInterval?: NodeJS.Timeout | null;
  ws: WebSocket;
}