import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface RoverVerification {
  robloxId: number;
  robloxUsername: string;
}

interface CacheEntry {
  data: RoverVerification | null;
  fetchedAt: number;
}

const verificationCache = new Map<string, CacheEntry>();

/**
 * Verify a Discord user's Roblox account via the Rover API.
 * Returns null if the user is not verified.
 */
export async function verifyUser(discordId: string): Promise<RoverVerification | null> {
  // Check cache
  const cached = verificationCache.get(discordId);
  if (cached && Date.now() - cached.fetchedAt < config.rover.cacheTtlMs) {
    return cached.data;
  }

  try {
    const response = await fetch(
      `${config.rover.apiUrl}/users/discord/${discordId}`,
    );

    if (!response.ok) {
      if (response.status === 404) {
        // User not verified with Rover
        verificationCache.set(discordId, { data: null, fetchedAt: Date.now() });
        return null;
      }
      logger.error(`Rover API returned ${response.status} for Discord ID ${discordId}`);
      return null;
    }

    const data = await response.json() as {
      robloxId?: number;
      robloxUsername?: string;
    };

    if (!data.robloxId || !data.robloxUsername) {
      verificationCache.set(discordId, { data: null, fetchedAt: Date.now() });
      return null;
    }

    const result: RoverVerification = {
      robloxId: data.robloxId,
      robloxUsername: data.robloxUsername,
    };

    verificationCache.set(discordId, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (error) {
    logger.error(`Rover verification failed for Discord ID ${discordId}:`, error);
    return null;
  }
}

/**
 * Fetch a Roblox user's avatar headshot URL.
 * Uses the RoProxy thumbnail API (unofficial but reliable).
 * The URL expires after ~1 week, so store the expiry date.
 */
export async function fetchRobloxHeadshot(robloxId: number): Promise<{ url: string; expiresAt: Date }> {
  try {
    const response = await fetch(
      `${config.roblox.thumbnailApiUrl}?userIds=${robloxId}&size=150x150&format=Png&isCircular=false`,
    );

    if (!response.ok) {
      logger.error(`Roblox thumbnail API returned ${response.status} for Roblox ID ${robloxId}`);
      return { url: '', expiresAt: new Date(Date.now() + 60 * 60 * 1000) }; // retry in 1h
    }

    const data = await response.json() as {
      data?: Array<{ imageUrl?: string }>;
    };

    const url = data.data?.[0]?.imageUrl ?? '';
    // Thumbnails expire in ~1 week; set expiry to 6 days to be safe
    const expiresAt = new Date(Date.now() + config.rover.thumbnailRefreshMs);

    return { url, expiresAt };
  } catch (error) {
    logger.error(`Failed to fetch Roblox headshot for ID ${robloxId}:`, error);
    return { url: '', expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
  }
}

/**
 * Check if a cached headshot URL is expired and needs refreshing.
 */
export function isHeadshotExpired(expiresAt: Date): boolean {
  return new Date() >= expiresAt;
}
