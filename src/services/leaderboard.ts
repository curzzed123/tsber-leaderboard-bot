import { EmbedBuilder, TextChannel, type Client } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { getGuildConfig } from '../database/models/GuildConfig.js';
import { PlayerStatus } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { formatRank, formatRecord, formatStreak } from '../utils/formatting.js';
import { fetchRobloxHeadshot, isHeadshotExpired } from './rover.js';
import type { LeaderboardEntry } from '../database/models/GuildConfig.js';

let editTimer: NodeJS.Timeout | null = null;
const pendingGuilds = new Set<string>();

/**
 * Build a leaderboard embed for a specific rank range.
 */
async function buildLeaderboardEmbed(
  guildId: string,
  minRank: number,
  maxRank: number,
  title: string,
): Promise<EmbedBuilder> {
  const players = await Player.find({ guildId, rank: { $gte: minRank, $lte: maxRank } })
    .sort({ rank: 1 })
    .lean();

  // Refresh expired headshots in the background (non-blocking)
  for (const player of players) {
    if (player.robloxHeadshotUrl && isHeadshotExpired(player.robloxHeadshotExpiresAt)) {
      fetchRobloxHeadshot(player.robloxId).then(async ({ url, expiresAt }) => {
        if (url) {
          await Player.updateOne(
            { _id: player._id },
            { robloxHeadshotUrl: url, robloxHeadshotExpiresAt: expiresAt },
          );
        }
      });
    }
  }

  // Also get unranked players count
  const unrankedCount = await Player.countDocuments({ guildId, rank: null });

  const lines: string[] = [];

  if (players.length === 0) {
    lines.push(`*No players ranked #${minRank}–#${maxRank} yet.*`);
  } else {
    for (const player of players) {
      const statusEmoji = getStatusEmoji(player.status);
      const rankStr = formatRank(player.rank);
      const record = formatRecord(player.wins, player.losses);
      const streak = formatStreak(player.streak);
      const region = player.region ? `🌍 ${player.region}` : '';

      // Medal for top 3
      let medal = '';
      if (player.rank === 1) medal = '🥇';
      else if (player.rank === 2) medal = '🥈';
      else if (player.rank === 3) medal = '🥉';

      lines.push(
        `${medal} **${rankStr}** ${statusEmoji} — **${player.robloxUsername}** ${region}\n` +
        `　　${record} | ${streak}`,
      );
    }
  }

  if (unrankedCount > 0 && minRank === 1) {
    lines.push(`\n*${unrankedCount} unranked player(s) in Stage 0.*`);
  }

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(0x5865F2)
    .setDescription(lines.join('\n\n'))
    .setTimestamp()
    .setFooter({ text: 'Updated in real-time • Challenge in #challenge-tickets' });

  // Set thumbnail to top player's headshot in this range
  if (players.length > 0 && players[0].robloxHeadshotUrl) {
    embed.setThumbnail(players[0].robloxHeadshotUrl);
  }

  return embed;
}

/**
 * Get the status emoji for a player.
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case PlayerStatus.CHALLENGING:
      return '⚔️';
    case PlayerStatus.CHALLENGED:
      return '🛡️';
    case PlayerStatus.IMMUNE:
      return '🛡️';
    case PlayerStatus.COOLDOWN:
      return '⏳';
    default:
      return '';
  }
}

/**
 * Send or update the leaderboard messages across all configured channels.
 * Called once on setup, and to recover from deleted messages.
 */
export async function initLeaderboardMessages(
  client: Client,
  guildId: string,
): Promise<void> {
  const guildConfig = await getGuildConfig(guildId);

  for (const lb of guildConfig.leaderboards) {
    try {
      const channel = await client.channels.fetch(lb.channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        logger.error(`Leaderboard channel ${lb.channelId} not found or not a text channel`);
        continue;
      }

      const embed = await buildLeaderboardEmbed(guildId, lb.minRank, lb.maxRank, lb.title);

      if (lb.messageId) {
        try {
          const message = await channel.messages.fetch(lb.messageId);
          await message.edit({ embeds: [embed] });
          logger.info(`Leaderboard "${lb.title}" message updated`);
          continue;
        } catch {
          logger.warn(`Existing leaderboard message for "${lb.title}" not found, creating new one`);
        }
      }

      const message = await channel.send({ embeds: [embed] });
      lb.messageId = message.id;
      logger.info(`Leaderboard "${lb.title}" message created (ID: ${message.id})`);
    } catch (error) {
      logger.error(`Failed to init leaderboard "${lb.title}":`, error);
    }
  }

  await guildConfig.save();
}

/**
 * Refresh all leaderboards for a guild by editing existing messages.
 * Debounced to max once per editDebounceMs to avoid rate limits.
 */
export async function refreshLeaderboard(guildId: string): Promise<void> {
  pendingGuilds.add(guildId);

  if (editTimer) return;

  editTimer = setTimeout(async () => {
    editTimer = null;
    const guilds = Array.from(pendingGuilds);
    pendingGuilds.clear();

    for (const gid of guilds) {
      try {
        await refreshLeaderboardNow(gid);
      } catch (error) {
        logger.error(`Failed to refresh leaderboard for guild ${gid}:`, error);
      }
    }
  }, config.leaderboard.editDebounceMs);
}

/**
 * Immediately refresh all leaderboard messages for a guild (bypasses debounce).
 */
async function refreshLeaderboardNow(guildId: string): Promise<void> {
  const client = (globalThis as any).client as Client | undefined;
  if (!client) {
    logger.warn('Client not available on globalThis, skipping leaderboard refresh');
    return;
  }

  const guildConfig = await getGuildConfig(guildId);

  for (const lb of guildConfig.leaderboards) {
    if (!lb.channelId || !lb.messageId) {
      continue;
    }

    try {
      const channel = await client.channels.fetch(lb.channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        logger.error(`Leaderboard channel ${lb.channelId} not found`);
        continue;
      }

      const message = await channel.messages.fetch(lb.messageId);
      const embed = await buildLeaderboardEmbed(guildId, lb.minRank, lb.maxRank, lb.title);
      await message.edit({ embeds: [embed] });
      logger.debug(`Leaderboard "${lb.title}" refreshed for guild ${guildId}`);
    } catch (error) {
      logger.error(`Failed to edit leaderboard "${lb.title}":`, error);
      // Message might have been deleted — recreate it
      if (error instanceof Error && error.message.includes('Unknown Message')) {
        lb.messageId = null;
        await guildConfig.save();
        await initLeaderboardMessages(client, guildId);
      }
    }
  }
}
