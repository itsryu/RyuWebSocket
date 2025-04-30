import { APIGuildMember, GatewayDispatchEvents, GatewayGuildMembersChunkPresence, GatewayOpcodes } from "discord-api-types/v10";
import { SpotifyEvents } from "./spotifyInterfaces";
import { WebSocket } from "ws";

export type WebSocketReceivePayloadEvents = SpotifyEvents | GatewayDispatchEvents | WebSocketShardEvents;

export enum WebsocketOpcodes {
    Dispatch = 0,
    Heartbeat = 1,
    Identify = 2,
    Resume = 6,
    Reconnect = 7,
    InvalidSession = 9,
    Hello = 10,
    HeartbeatAck = 11,
    RequestGuildMembers = 8,
    ReconnectRequired = 13,
    SessionInvalidated = 14,
    ResumeSuggested = 15,
    Error = 4005,
    UnknownError = 4000,
    InvalidOpcode = 4001,
    DecodeError = 4002,
    NotAuthenticated = 4003,
    AuthenticationFailed = 4004,
    AlreadyAuthenticated = 4005,
    RateLimited = 4008
}

export interface WebSocketSendPayload {
    op: WebsocketOpcodes | GatewayOpcodes;
    d: any;
}

export interface IdentifyPayload {
    session: string;
    ids?: string[];
}

export interface WebSocketGuildMembersChunkDispatchData {
    guild_id: string;
    members: APIGuildMember[];
    presences?: GatewayGuildMembersChunkPresence[];
    nonce?: string;
}

export interface WebSocketRequestGuildMemberPayload {
    op: WebsocketOpcodes.RequestGuildMembers;
    d: WebSocketRequestGuildMembersPayloadData;
}

export interface WebSocketRequestGuildMembersPayloadData {
    guild_id: string;
    presences?: boolean;
    limit?: number;
    user_ids: string | string[];
    with_profile?: boolean;
}

export interface ReadyPayload {
    session_id: string;
    fingerprint: string;
    user_ids?: string[];
    _trace: string[];
}

export interface WebsocketReceivePayload {
    op: WebsocketOpcodes | GatewayOpcodes;
    d?: any;
    t?: string | WebSocketShardEvents;
    s?: number;
    _trace?: string[];
}

export interface WebSocketReadyEventPayload {
    session_id: string,
    user_id: string,
    fingerprint: string,
    _trace: string[]
}

export enum WebSocketShardEvents {
    Ready = 'READY',
    Resumed = 'RESUMED',
    Debug = 'DEBUG',
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
    ip: string;
    ws: WebSocket;
    isAlive: boolean;
    pingInterval: NodeJS.Timeout | null;
    missedPings: number;
    maxMissedPings: number;
    sequence: number;
    sessionId: string | null;
    identified: boolean;
    user: {
        ids: string[];
    };
    protocol: string;
    lastSequenceNumber?: number;
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