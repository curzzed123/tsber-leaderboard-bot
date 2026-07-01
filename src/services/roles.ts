import type { Client } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { logger } from '../utils/logger.js';

const GUILD_ID = '1508900900381524089';

// Role IDs by rank tier
const ROLE_TIERS = [
  { minRank: 1, maxRank: 1, roleId: '1509623227889221704', name: 'Top 1' },
  { minRank: 2, maxRank: 10, roleId: '1509618794719609004', name: 'Top 10' },
  { minRank: 11, maxRank: 20, roleId: '1509622276390391839', name: 'Top 20' },
  { minRank: 21, maxRank: 30, roleId: '1509623127603286056', name: 'Top 30' },
];

const ALL_ROLE_IDS = ROLE_TIERS.map(t => t.roleId);

/**
 * Get the role ID for a given rank.
 */
function getRoleForRank(rank: number | null): string | null {
  if (rank === null) return null;
  const tier = ROLE_TIERS.find(t => rank >= t.minRank && rank <= t.maxRank);
  return tier?.roleId ?? null;
}

/**
 * Update a single player's roles based on their current rank.
 * Removes old tier roles, adds the correct one.
 */
export async function updatePlayerRoles(client: Client, discordId: string, rank: number | null): Promise<void> {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;

    const correctRole = getRoleForRank(rank);

    // Remove all tier roles
    for (const roleId of ALL_ROLE_IDS) {
      if (member.roles.cache.has(roleId) && roleId !== correctRole) {
        await member.roles.remove(roleId).catch(() => {});
      }
    }

    // Add the correct role
    if (correctRole && !member.roles.cache.has(correctRole)) {
      await member.roles.add(correctRole).catch(() => {});
      logger.info(`Role ${correctRole} added to ${member.user.tag} for rank #${rank}`);
    }
  } catch (error) {
    logger.error(`Failed to update roles for ${discordId}:`, error);
  }
}

/**
 * Update roles for ALL players on the leaderboard.
 * Called after rank changes, match resolutions, and on bot startup.
 */
export async function updateAllRoles(client: Client): Promise<void> {
  try {
    const players = await Player.find({ guildId: GUILD_ID, rank: { $ne: null } });
    logger.info(`Updating roles for ${players.length} ranked players...`);

    for (const player of players) {
      await updatePlayerRoles(client, player.discordId, player.rank);
    }

    // Also remove roles from unranked players who might have had them
    const unranked = await Player.find({ guildId: GUILD_ID, rank: null });
    for (const player of unranked) {
      await updatePlayerRoles(client, player.discordId, null);
    }

    logger.info('Role update complete.');
  } catch (error) {
    logger.error('Failed to update all roles:', error);
  }
}
