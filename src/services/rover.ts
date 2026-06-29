import { logger } from '../utils/logger.js';

export interface RobloxUser {
  robloxId: number;
  robloxUsername: string;
}

interface CacheEntry {
  data: RobloxUser | null;
  fetchedAt: number;
}

const userCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Search for a Roblox user by username directly via Roblox API.
 * No Rover or Discord verification needed — just type the username.
 */
export async function findRobloxUser(username: string): Promise<RobloxUser | null> {
  // Check cache
  const cached = userCache.get(username.toLowerCase());
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    // Step 1: Search by username via Roblox API
    const searchRes = await fetch('https://users.roproxy.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: false,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!searchRes.ok) {
      logger.error(`Roblox username search failed: ${searchRes.status}`);
      return null;
    }

    const searchData = await searchRes.json() as {
      data?: Array<{ id: number; name: string; displayName: string }>;
    };

    if (!searchData.data || searchData.data.length === 0) {
      // User not found
      userCache.set(username.toLowerCase(), { data: null, fetchedAt: Date.now() });
      return null;
    }

    const user = searchData.data[0];
    const result: RobloxUser = {
      robloxId: user.id,
      robloxUsername: user.name,
    };

    userCache.set(username.toLowerCase(), { data: result, fetchedAt: Date.now() });
    return result;
  } catch (error) {
    logger.error(`Failed to find Roblox user "${username}":`, error);
    return null;
  }
}

/**
 * Fetch a Roblox user's avatar headshot URL.
 * Uses the RoProxy thumbnail API.
 */
export async function fetchRobloxHeadshot(robloxId: number): Promise<{ url: string; expiresAt: Date }> {
  try {
    const response = await fetch(
      `https://thumbnails.roproxy.com/v1/users/avatar-headshot?userIds=${robloxId}&size=420x420&format=Png&isCircular=false`,
      { signal: AbortSignal.timeout(10000) },
    );

    if (!response.ok) {
      logger.error(`Roblox thumbnail API returned ${response.status} for ID ${robloxId}`);
      return { url: '', expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
    }

    const data = await response.json() as {
      data?: Array<{ imageUrl?: string }>;
    };

    const url = data.data?.[0]?.imageUrl ?? '';
    const expiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

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
