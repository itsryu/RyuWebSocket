import { GatewayGuildMembersChunkDispatchData, GatewayIntentBits, GatewayPresenceUpdateDispatchData } from 'discord-api-types/v10';

export interface ClientOptions {
  intents: GatewayIntentBits[]
}

export interface MemberPresence extends GatewayPresenceUpdateDispatchData, GatewayGuildMembersChunkDispatchData {
  data: DiscordUser
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