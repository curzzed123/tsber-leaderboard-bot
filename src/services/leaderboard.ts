import { EmbedBuilder, TextChannel, type Client } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { getGuildConfig } from '../database/models/GuildConfig.js';
import { PlayerStatus } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  getStatusText,
  robloxProfileLink,
} from '../utils/formatting.js';
import { fetchRobloxHeadshot, isHeadshotExpired } from './rover.js';

const GIF_URL = 'https://cdn.discordapp.com/attachments/1409616969770205296/1466903491795488810/asa_3_1.gif?ex=6a2dc756&is=6a2c75d6&hm=94ffb671b92a4fef04c6606613ae41c7e7131b6912cdd8cb714dbf268814684e&';

function playerFieldName(player: any): string {
  const rank = player.rank ?? 0;
  const nameLink = robloxProfileLink(player.robloxUsername, player.robloxId);
  return `**#${rank}**  ${nameLink}`;
}

function playerFieldValue(player: any): string {
  const statusText = getStatusText(player.status as PlayerStatus);
  const region = player.region ?? '-';
  const stage = player.stage || '-';
  const mention = `<@${player.discordId}>`;
  return (
    `ID: ${player.robloxId}\n` +
    `${mention}\n` +
    `<< | .${player.robloxUsername}. | >>\n` +
    `Region: ${region}\n` +
    `Stage: **${stage}**\n` +
    `Status: ${statusText}\n` +
    `wins: ${player.wins} losses: ${player.losses}`
  );
}

function vacantFieldName(rank: number): string {
  return `**#${rank}**  Vacant`;
}

function vacantFieldValue(): string {
  return (
    `ID: —\n` +
    `*No player registered*\n` +
    `<< | .vacant. | >>\n` +
    `Region: —\n` +
    `Stage: —\n` +
    `Status: Empty\n` +
    `wins: 0 losses: 0`
  );
}

/**
 * Build an array of embeds for a rank range.
 * Each rank = one embed with GIF image between entries.
 * Max 10 embeds per message (Discord limit).
 */
async function buildLeaderboardEmbeds(
  guildId: string,
  minRank: number,
  maxRank: number,
): Promise<EmbedBuilder[]> {
  const players = await Player.find({ guildId, rank: { $gte: minRank, $lte: maxRank } })
    .sort({ rank: 1 })
    .lean();

  // Refresh expired headshots in the background
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

  const playerMap = new Map<number, any>();
  for (const player of players) {
    if (player.rank !== null) {
      playerMap.set(player.rank, player);
    }
  }

  const embeds: EmbedBuilder[] = [];
  const ranks: number[] = [];
  for (let r = minRank; r <= maxRank; r++) ranks.push(r);

  for (let i = 0; i < ranks.length && embeds.length < 10; i++) {
    const rank = ranks[i];
    const player = playerMap.get(rank);
    const fieldName = player ? playerFieldName(player) : vacantFieldName(rank);
    const fieldValue = player ? playerFieldValue(player) : vacantFieldValue();

    const embed = new EmbedBuilder()
      .setColor(0x1a1a2e)
      .addFields({ name: fieldName, value: fieldValue, inline: false })
      .setImage(GIF_URL);

    embeds.push(embed);
  }

  // Set thumbnail on first embed to #1 player's headshot
  const topPlayer = players.find((p) => p.rank === minRank);
  if (topPlayer?.robloxHeadshotUrl && embeds.length > 0) {
    embeds[0].setThumbnail(topPlayer.robloxHeadshotUrl);
  }

  return embeds;
}

/**
 * Find the bot's leaderboard message in a channel.
 * Tries stored messageId first, then searches recent messages.
 */
async function findLeaderboardMessage(
  client: Client,
  channelId: string,
  messageId: string | null,
): Promise<{ message: any; updatedId: string } | null> {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel)) {
    logger.error(`Channel ${channelId} not found or not a text channel`);
    return null;
  }

  // Try stored message ID first
  if (messageId) {
    try {
      const message = await channel.messages.fetch(messageId);
      if (message && message.author.id === client.user!.id) {
        return { message, updatedId: messageId };
      }
    } catch {
      // Message ID is stale — fall through to search
    }
  }

  // Search recent messages for the bot's embed message
  const messages = await channel.messages.fetch({ limit: 20 });
  const botMsg = messages.find(
    (m) => m.author.id === client.user!.id && m.embeds.length > 0,
  );

  if (botMsg) {
    return { message: botMsg, updatedId: botMsg.id };
  }

  return null;
}

/**
 * Send or update the leaderboard messages across all configured channels.
 */
export async function initLeaderboardMessages(
  client: Client,
  guildId: string,
): Promise<void> {
  const guildConfig = await getGuildConfig(guildId);

  for (const lb of guildConfig.leaderboards) {
    try {
      const embeds = await buildLeaderboardEmbeds(guildId, lb.minRank, lb.maxRank);

      const found = await findLeaderboardMessage(client, lb.channelId, lb.messageId);

      if (found) {
        await found.message.edit({ embeds });
        if (lb.messageId !== found.updatedId) {
          lb.messageId = found.updatedId;
          await guildConfig.save();
        }
        logger.info(`Leaderboard ranks ${lb.minRank}-${lb.maxRank} updated (message: ${found.updatedId})`);
      } else {
        // No existing message found — send a new one
        const channel = await client.channels.fetch(lb.channelId) as TextChannel;
        if (!channel) continue;
        const message = await channel.send({ embeds });
        lb.messageId = message.id;
        await guildConfig.save();
        logger.info(`Leaderboard ranks ${lb.minRank}-${lb.maxRank} created (message: ${message.id})`);
      }
    } catch (error) {
      logger.error(`Failed to init leaderboard ranks ${lb.minRank}-${lb.maxRank}:`, error);
    }
  }
}

/**
 * Refresh all leaderboards for a guild by editing existing messages.
 * Runs immediately — no debounce. Every change shows up instantly.
 */
export async function refreshLeaderboard(guildId: string): Promise<void> {
  const client = (globalThis as any).client as Client | undefined;
  if (!client) {
    logger.warn('Client not available, skipping leaderboard refresh');
    return;
  }

  const guildConfig = await getGuildConfig(guildId);

  for (const lb of guildConfig.leaderboards) {
    if (!lb.channelId) continue;

    try {
      const embeds = await buildLeaderboardEmbeds(guildId, lb.minRank, lb.maxRank);
      const found = await findLeaderboardMessage(client, lb.channelId, lb.messageId);

      if (found) {
        await found.message.edit({ embeds });
        if (lb.messageId !== found.updatedId) {
          lb.messageId = found.updatedId;
          await guildConfig.save();
        }
        logger.info(`Leaderboard ranks ${lb.minRank}-${lb.maxRank} refreshed`);
      } else {
        // No message found — create one
        const channel = await client.channels.fetch(lb.channelId) as TextChannel;
        if (!channel) continue;
        const message = await channel.send({ embeds });
        lb.messageId = message.id;
        await guildConfig.save();
        logger.info(`Leaderboard ranks ${lb.minRank}-${lb.maxRank} created (was missing)`);
      }
    } catch (error) {
      logger.error(`Failed to refresh leaderboard ranks ${lb.minRank}-${lb.maxRank}:`, error);
    }
  }
}
