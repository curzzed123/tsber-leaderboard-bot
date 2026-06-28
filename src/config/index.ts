import 'dotenv/config';
import { Region } from '../types/index.js';

export const config = {
  token: process.env.DISCORD_TOKEN ?? '',
  guildId: process.env.GUILD_ID ?? '',
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/tsber-leaderboard',

  channels: {
    // Multiple leaderboard channels: Top 10, Top 20, Top 30
    leaderboardChannels: [
      { id: process.env.LEADERBOARD_CHANNEL_1_ID ?? '', minRank: 1, maxRank: 10, title: '🏆 Top 10 Leaderboard' },
      { id: process.env.LEADERBOARD_CHANNEL_2_ID ?? '', minRank: 11, maxRank: 20, title: '⚔️ Top 20 Leaderboard' },
      { id: process.env.LEADERBOARD_CHANNEL_3_ID ?? '', minRank: 21, maxRank: 30, title: '🎖️ Top 30 Leaderboard' },
    ].filter((ch) => ch.id !== ''),
    ticketsChannelId: process.env.TICKETS_CHANNEL_ID ?? '',
    ticketsCategoryId: process.env.TICKETS_CATEGORY_ID ?? '',
    loaChannelId: process.env.LOA_CHANNEL_ID ?? '',
  },

  roles: {
    refereesRoleId: process.env.REFEREES_ROLE_ID ?? '',
    staffRoleIds: (process.env.STAFF_ROLE_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  },

  durations: {
    dodgeMs: 48 * 60 * 60 * 1000,          // 48 hours
    inactivityMs: 3 * 24 * 60 * 60 * 1000,  // 3 days
    cooldownMs: 3 * 24 * 60 * 60 * 1000,    // 3 days
    cooldownTop10Ms: 7 * 24 * 60 * 60 * 1000, // 1 week
    immunityMs: 3 * 24 * 60 * 60 * 1000,    // 3 days
    immunityTop10Ms: 7 * 24 * 60 * 60 * 1000, // 1 week
    lockoutMs: 3 * 24 * 60 * 60 * 1000,     // 3 days
  },

  scheduler: {
    intervalMs: 60 * 1000, // 60 seconds
  },

  leaderboard: {
    editDebounceMs: 2000, // debounce edits to max once per 2s
    pageSize: 20,
  },

  rover: {
    apiUrl: 'https://api.rover.link/v2',
    cacheTtlMs: 60 * 60 * 1000, // 1 hour for rover data
    thumbnailRefreshMs: 6 * 24 * 60 * 60 * 1000, // 6 days
  },

  roblox: {
    thumbnailApiUrl: 'https://thumbnails.roproxy.com/v1/users/avatar-headshot',
  },

  regions: Object.values(Region),
} as const;
