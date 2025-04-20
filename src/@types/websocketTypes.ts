import { GatewayDispatchEvents, GatewayOpcodes, GatewayRequestGuildMembersDataWithUserIds } from "discord-api-types/v10";
import { SpotifyEvents, SpotifyTrackResponse } from "./spotifyInterfaces";
import { MemberPresence } from "./discordTypes";
import { WebSocket } from "ws";

export enum WebSocketState {
    Connected = 'Connected',
    Disconnected = 'Disconnected',
    Reconnecting = 'Reconnecting',
    RateLimited = 'RateLimited',
    Heartbeat = 'Heartbeat',
}

export type WebSocketReceivePayloadEvents = SpotifyEvents | GatewayDispatchEvents | WebSocketState;

export enum WebsocketOpcodes {
    Connected = 100,
    Disconnected = 101,
    Reconnecting = 102,
    RateLimited = 102,
    Heartbeat = 103,
}

export interface WebsocketReceivePayload {
    op: GatewayOpcodes | WebsocketOpcodes | null;
    d?: SpotifyTrackResponse | MemberPresence | GatewayRequestGuildMembersDataWithUserIds | null;
    t?: WebSocketReceivePayloadEvents | null;
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

export enum WebSocketShardDestroyRecovery {
    Reconnect,
    Resume,
}

export interface WebSocketShardDestroyOptions {
    code?: number;
    reason?: string;
    recover?: WebSocketShardDestroyRecovery;
}

export enum CloseCodes {
    Normal = 1_000,
    Resuming = 4_200,
}