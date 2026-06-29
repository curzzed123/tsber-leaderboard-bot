import { EmbedBuilder, TextChannel, type Client, type Message } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { PlayerStatus } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getStatusText } from '../utils/formatting.js';
import { fetchRobloxHeadshot, isHeadshotExpired } from './rover.js';

const LEADERBOARDS = [
  { channelId: '1509210175406604328', minRank: 1, maxRank: 10 },
  { channelId: '1509210720011554987', minRank: 11, maxRank: 20 },
  { channelId: '1509210811766276276', minRank: 21, maxRank: 30 },
];

const GUILD_ID = '1508900900381524089';
const LOG_CHANNEL_ID = '1521245230505005118';

const messageIdCache = new Map<string, string>();

function fieldName(player: any): string {
  return `**#${player.rank}**  ${player.robloxUsername}`;
}
function vacantFieldName(rank: number): string {
  return `**#${rank}**  Vacant`;
}

function fieldValue(player: any): string {
  const statusText = getStatusText(player.status as PlayerStatus);
  const profileLink = `https://www.roblox.com/users/${player.robloxId}/profile`;
  const discordTag = player.discordUsername || 'unknown';
  return (
    `<< | .[${player.robloxUsername}](${profileLink}). | >>\n` +
    `| @${discordTag} |\n` +
    `ID: ${player.robloxId}\n` +
    `Region: ${player.region ?? '-'}\n` +
    `Stage: **${player.stage || '-'}**\n` +
    `Status: ${statusText}\n` +
    `wins: ${player.wins} losses: ${player.losses}`
  );
}

function vacantFieldValue(): string {
  return '<< | .vacant. | >>\nNo player registered\nRegion: —\nStage: —\nStatus: Empty\nwins: 0 losses: 0';
}

async function buildEmbeds(minRank: number, maxRank: number): Promise<EmbedBuilder[]> {
  const players = await Player.find({ guildId: GUILD_ID, rank: { $gte: minRank, $lte: maxRank } })
    .sort({ rank: 1 })
    .lean();

  const playerMap = new Map<number, any>();
  for (const p of players) if (p.rank !== null) playerMap.set(p.rank, p);

  const embeds: EmbedBuilder[] = [];
  for (let rank = minRank; rank <= maxRank && embeds.length < 10; rank++) {
    const player = playerMap.get(rank);
    const embed = new EmbedBuilder()
      .setColor(0x1a1a2e)
      .addFields({
        name: player ? fieldName(player) : vacantFieldName(rank),
        value: player ? fieldValue(player) : vacantFieldValue(),
        inline: false,
      });
    if (player?.robloxHeadshotUrl) embed.setThumbnail(player.robloxHeadshotUrl);
    embeds.push(embed);
  }

  for (const p of players) {
    if (p.robloxHeadshotUrl && isHeadshotExpired(p.robloxHeadshotExpiresAt)) {
      fetchRobloxHeadshot(p.robloxId).then(async ({ url, expiresAt }) => {
        if (url) await Player.updateOne({ _id: p._id }, { robloxHeadshotUrl: url, robloxHeadshotExpiresAt: expiresAt });
      }).catch(() => {});
    }
  }

  return embeds;
}

/**
 * Find message — cache first, then search channel.
 * If old message has dead content, delete it so we can send fresh.
 */
async function findMessage(channel: TextChannel, channelId: string): Promise<Message | null> {
  const cachedId = messageIdCache.get(channelId);
  if (cachedId) {
    try { return await channel.messages.fetch(cachedId); } catch {}
  }
  const messages = await channel.messages.fetch({ limit: 20 });
  const botMsg = messages.find((m) => m.author.id === channel.client.user!.id && m.embeds.length > 0);
  if (botMsg) {
    messageIdCache.set(channelId, botMsg.id);
    return botMsg;
  }
  return null;
}

export async function initLeaderboardMessages(client: Client): Promise<void> {
  for (const lb of LEADERBOARDS) {
    try {
      const channel = await client.channels.fetch(lb.channelId) as TextChannel;
      if (!channel) continue;

      const embeds = await buildEmbeds(lb.minRank, lb.maxRank);

      // Find old message, DELETE it, send fresh (avoids dead GIF hang)
      const oldMsg = await findMessage(channel, lb.channelId);
      if (oldMsg) {
        try { await oldMsg.delete(); } catch {}
      }

      const newMsg = await channel.send({ embeds });
      messageIdCache.set(lb.channelId, newMsg.id);
      logger.info(`Leaderboard ${lb.minRank}-${lb.maxRank}: sent fresh message ${newMsg.id}`);
    } catch (error) {
      logger.error(`Failed to init leaderboard ${lb.minRank}-${lb.maxRank}:`, error);
    }
  }
}

export async function refreshLeaderboard(_guildId?: string): Promise<void> {
  const client = (globalThis as any).client as Client | undefined;
  if (!client) { logger.error('REFRESH FAILED: Client not available'); return; }

  for (const lb of LEADERBOARDS) {
    try {
      const channel = await client.channels.fetch(lb.channelId) as TextChannel;
      if (!channel) continue;

      const embeds = await buildEmbeds(lb.minRank, lb.maxRank);
      const msg = await findMessage(channel, lb.channelId);

      if (msg) {
        await msg.edit({ embeds });
        logger.info(`REFRESH: Leaderboard ${lb.minRank}-${lb.maxRank} edited OK`);
      } else {
        const newMsg = await channel.send({ embeds });
        messageIdCache.set(lb.channelId, newMsg.id);
        logger.info(`REFRESH: Leaderboard ${lb.minRank}-${lb.maxRank} created new message`);
      }
    } catch (error) {
      logger.error(`REFRESH FAILED: Leaderboard ${lb.minRank}-${lb.maxRank}:`, error);
    }
  }
}

/**
 * Log an event to the designated log channel.
 * Used for: profile created, spot taken, rank changed, etc.
 */
export async function logEvent(title: string, description: string): Promise<void> {
  const client = (globalThis as any).client as Client | undefined;
  if (!client) return;

  try {
    const channel = await client.channels.fetch(LOG_CHANNEL_ID) as TextChannel;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(0x5865F2)
      .setDescription(description)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error('Failed to log event:', error);
  }
}
