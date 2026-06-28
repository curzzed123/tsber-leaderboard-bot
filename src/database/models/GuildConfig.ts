import { Schema, model, type Document } from 'mongoose';

export interface GuildDurations {
  dodgeMs: number;
  inactivityMs: number;
  cooldownMs: number;
  cooldownTop10Ms: number;
  immunityMs: number;
  immunityTop10Ms: number;
  lockoutMs: number;
}

export interface LeaderboardEntry {
  channelId: string;
  messageId: string | null;
  minRank: number;
  maxRank: number;
  title: string;
}

export interface IGuildConfig extends Document {
  guildId: string;
  leaderboards: LeaderboardEntry[];
  ticketsChannelId: string;
  ticketsEmbedMessageId: string | null;
  ticketsCategoryId: string | null;
  refereesRoleId: string;
  staffRoleIds: string[];
  loaChannelId: string | null;
  durations: GuildDurations;
  createdAt: Date;
  updatedAt: Date;
}

const durationsSchema = new Schema<GuildDurations>(
  {
    dodgeMs: { type: Number, default: 48 * 60 * 60 * 1000 },
    inactivityMs: { type: Number, default: 3 * 24 * 60 * 60 * 1000 },
    cooldownMs: { type: Number, default: 3 * 24 * 60 * 60 * 1000 },
    cooldownTop10Ms: { type: Number, default: 7 * 24 * 60 * 60 * 1000 },
    immunityMs: { type: Number, default: 3 * 24 * 60 * 60 * 1000 },
    immunityTop10Ms: { type: Number, default: 7 * 24 * 60 * 60 * 1000 },
    lockoutMs: { type: Number, default: 3 * 24 * 60 * 60 * 1000 },
  },
  { _id: false },
);

const leaderboardEntrySchema = new Schema<LeaderboardEntry>(
  {
    channelId: { type: String, required: true },
    messageId: { type: String, default: null },
    minRank: { type: Number, required: true },
    maxRank: { type: Number, required: true },
    title: { type: String, required: true },
  },
  { _id: false },
);

const guildConfigSchema = new Schema<IGuildConfig>(
  {
    guildId: { type: String, required: true, unique: true },
    leaderboards: { type: [leaderboardEntrySchema], default: [] },
    ticketsChannelId: { type: String, default: '' },
    ticketsEmbedMessageId: { type: String, default: null },
    ticketsCategoryId: { type: String, default: null },
    refereesRoleId: { type: String, default: '' },
    staffRoleIds: { type: [String], default: [] },
    loaChannelId: { type: String, default: null },
    durations: { type: durationsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export const GuildConfig = model<IGuildConfig>('GuildConfig', guildConfigSchema);

/**
 * Get or create a GuildConfig for a given guild.
 */
export async function getGuildConfig(guildId: string): Promise<IGuildConfig> {
  let doc = await GuildConfig.findOne({ guildId });
  if (!doc) {
    doc = await GuildConfig.create({
      guildId,
      leaderboards: [],
      ticketsChannelId: '',
      ticketsCategoryId: null,
      refereesRoleId: '',
      staffRoleIds: [],
    });
  }
  return doc;
}

/**
 * Get durations for a guild, falling back to config defaults.
 */
export async function getGuildDurations(guildId: string): Promise<GuildDurations> {
  const doc = await getGuildConfig(guildId);
  return doc.durations;
}
