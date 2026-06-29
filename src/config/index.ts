import 'dotenv/config';
import { Region } from '../types/index.js';

export const config = {
  token: process.env.DISCORD_TOKEN ?? '',
  guildId: process.env.GUILD_ID ?? '',
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/tsber-leaderboard',

  durations: {
    dodgeMs: 48 * 60 * 60 * 1000,
    inactivityMs: 3 * 24 * 60 * 60 * 1000,
    cooldownMs: 2 * 24 * 60 * 60 * 1000,          // 2 days
    cooldownTop10Ms: 7 * 24 * 60 * 60 * 1000,     // 1 week for Top 10
    immunityMs: 2 * 24 * 60 * 60 * 1000,          // 2 days
    immunityTop10Ms: 7 * 24 * 60 * 60 * 1000,     // 1 week for Top 10
    lockoutMs: 3 * 24 * 60 * 60 * 1000,           // 3 days re-challenge block
  },

  scheduler: {
    intervalMs: 60 * 1000,
  },

  leaderboard: {
    editDebounceMs: 2000,
    pageSize: 20,
  },

  rover: {
    apiUrl: 'https://api.rover.link/v2',
    cacheTtlMs: 60 * 60 * 1000,
    thumbnailRefreshMs: 6 * 24 * 60 * 60 * 1000,
  },

  roblox: {
    thumbnailApiUrl: 'https://thumbnails.roproxy.com/v1/users/avatar-headshot',
  },

  regions: Object.values(Region),
} as const;
