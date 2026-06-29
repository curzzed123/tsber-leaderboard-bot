import { EmbedBuilder, TextChannel, type Client, type Message } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { getGuildConfig } from '../database/models/GuildConfig.js';
import { PlayerStatus } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { getStatusText } from '../utils/formatting.js';
import { fetchRobloxHeadshot, isHeadshotExpired } from './rover.js';

const GIF_URL = 'https://cdn.discordapp.com/attachments/1409616969770205296/1466903491795488810/asa_3_1.gif?ex=6a2dc756&is=6a2c75d6&hm=94ffb671b92a4fef04c6606613ae41c7e7131b6912cdd8cb714dbf268814684e&';

const LEADERBOARDS = [
  { channelId: '1509210175406604328', minRank: 1, maxRank: 10 },
  { channelId: '1509210720011554987', minRank: 11, maxRank: 20 },
  { channelId: '1509210811766276276', minRank: 21, maxRank: 30 },
];

const GUILD_ID = '1508900900381524089';

const messageIdCache = new Map<string, string>();

// Field name: just rank + username (plain text, no link — Discord doesn't render links in field names)
function fieldName(player: any): string {
  return `**#${player.rank}**  ${player.robloxUsername}`;
}

function vacantFieldName(rank: number): string {
  return `**#${rank}**  Vacant`;
}

// Field value: the clickable Roblox profile link goes HERE (blue in Discord)
function fieldValue(player: any): string {
  const statusText = getStatusText(player.status as PlayerStatus);
  const profileLink = `https://www.roblox.com/users/${player.robloxId}/profile`;
  // [username](url) renders as blue clickable text in embed field values
  return (
    `[${player.robloxUsername}](${profileLink})\n` +
    `ID: ${player.robloxId}\n` +
    `<< | .${player.robloxUsername}. | >>\n` +
    `Region: ${player.region ?? '-'}\n` +
    `Stage: **${player.stage || '-'}**\n` +
    `Status: ${statusText}\n` +
    `wins: ${player.wins} losses: ${player.losses}`
  );
}

function vacantFieldValue(): string {
  return 'No player registered\n<< | .vacant. | >>\nRegion: —\nStage: —\nStatus: Empty\nwins: 0 losses: 0';
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
      })
      .setImage(GIF_URL);

    // Set thumbnail to THIS player's headshot (not just the first one)
    if (player?.robloxHeadshotUrl) {
      embed.setThumbnail(player.robloxHeadshotUrl);
    }

    embeds.push(embed);
  }

  // Background headshot refresh (non-blocking)
  for (const p of players) {
    if (p.robloxHeadshotUrl && isHeadshotExpired(p.robloxHeadshotExpiresAt)) {
      fetchRobloxHeadshot(p.robloxId).then(async ({ url, expiresAt }) => {
        if (url) await Player.updateOne({ _id: p._id }, { robloxHeadshotUrl: url, robloxHeadshotExpiresAt: expiresAt });
      }).catch(() => {});
    }
  }

  return embeds;
}

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
      const msg = await findMessage(channel, lb.channelId);
      if (msg) {
        await msg.edit({ embeds });
        messageIdCache.set(lb.channelId, msg.id);
        logger.info(`Leaderboard ${lb.minRank}-${lb.maxRank}: edited message ${msg.id}`);
      } else {
        const newMsg = await channel.send({ embeds });
        messageIdCache.set(lb.channelId, newMsg.id);
        logger.info(`Leaderboard ${lb.minRank}-${lb.maxRank}: created message ${newMsg.id}`);
      }
    } catch (error) {
      logger.error(`Failed to init leaderboard ${lb.minRank}-${lb.maxRank}:`, error);
    }
  }
}

export async function refreshLeaderboard(_guildId?: string): Promise<void> {
  const client = (globalThis as any).client as Client | undefined;
  if (!client) {
    logger.error('REFRESH FAILED: Client not available');
    return;
  }

  for (const lb of LEADERBOARDS) {
    try {
      const channel = await client.channels.fetch(lb.channelId) as TextChannel;
      if (!channel) continue;
      const msg = await findMessage(channel, lb.channelId);
      if (!msg) {
        logger.error(`REFRESH FAILED: No message found for ${lb.minRank}-${lb.maxRank}`);
        continue;
      }
      const embeds = await buildEmbeds(lb.minRank, lb.maxRank);
      await msg.edit({ embeds });
      logger.info(`REFRESH: Leaderboard ${lb.minRank}-${lb.maxRank} edited OK`);
    } catch (error) {
      logger.error(`REFRESH FAILED: Leaderboard ${lb.minRank}-${lb.maxRank}:`, error);
    }
  }
}
