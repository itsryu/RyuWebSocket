import { GatewayGuildMembersChunkDispatchData, GatewayIntentBits, GatewayOpcodes, GatewayPresenceUpdateDispatchData } from 'discord-api-types/v10';

export interface ClientOptions {
    intents: GatewayIntentBits[];
}

export interface MemberPresence extends GatewayPresenceUpdateDispatchData, GatewayGuildMembersChunkDispatchData {
    data: UserProfileResponse | undefined
}

interface AvatarDecorationData {
    asset: string;
    sku_id: string;
    expires_at: string | null;
}

export interface Identity {
    identity_guild_id: string;
    identity_enabled: boolean;
    tag: string;
    badge: string;
}

interface ConnectedAccount {
    type: string;
    id: string;
    name: string;
    verified: boolean;
    metadata?: {
        verified?: string;
        followers_count?: string;
        statuses_count?: string;
        created_at?: string;
        [key: string]: string | undefined;
    };
}

interface Badge {
    id: string;
    description: string;
    icon: string;
    link?: string;
}

interface MutualGuild {
    id: string;
    nick: string | null;
}

export interface UserResponse {
    id: string;
    username: string;
    avatar: string;
    discriminator: string;
    public_flags: number;
    flags: number;
    banner: string;
    accent_color: number;
    global_name: string;
    avatar_decoration_data: AvatarDecorationData;
    collectibles: any | null;
    banner_color: string;
    clan: Identity;
    primary_guild: Identity;
}

interface UserProfile {
    bio: string;
    accent_color: number;
    pronouns: string;
    profile_effect: any | null;
    banner: string;
    theme_colors: [number, number];
    popout_animation_particle_type: any | null;
    emoji: any | null;
}

export interface UserProfileResponse {
    user: {
        id: string;
        username: string;
        global_name: string;
        avatar: string;
        avatar_decoration_data?: AvatarDecorationData;
        collectibles: any | null;
        discriminator: string;
        public_flags: number;
        primary_guild: Identity;
        clan?: Identity;
        flags: number;
        banner: string;
        banner_color: string;
        accent_color: number;
        bio: string;
    };
    connected_accounts: ConnectedAccount[];
    premium_type: number;
    premium_since: string;
    premium_guild_since: string;
    profile_themes_experiment_bucket: number;
    user_profile: UserProfile;
    badges: Badge[];
    guild_badges: any[];
    mutual_guilds: MutualGuild[];
    legacy_username: string;
}

export const ImportantGatewayOpcodes = new Set([
    GatewayOpcodes.Heartbeat,
    GatewayOpcodes.Identify,
    GatewayOpcodes.Resume
]);

export enum StatusColors {
    online = '#23a55a',
    dnd = '#f23f43',
    idle = '#f0b132',
    offline = '#82838b'
}
