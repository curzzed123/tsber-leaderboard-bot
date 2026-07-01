import { EmbedBuilder, TextChannel, type Client, type Message } from 'discord.js';
import { Player } from '../database/models/Player.js';
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
const LOG_CHANNEL_ID = '1521245230505005118';

const messageIdCache = new Map<string, string>();

/**
 * Field name: #rank DiscordDisplayName
 * We fetch the guild member's display name (server nickname).
 */
async function fieldName(player: any, client: Client): Promise<string> {
  let displayName = player.robloxUsername;
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(player.discordId);
    displayName = member.displayName;
  } catch {}
      return `### **#${player.rank}**  ${displayName}`;
  }

  function vacantFieldName(rank: number): string {
    return `### **#${rank}**  Vacant`;
  }

/**
 * Field value — exact format:
 * ID: 509
 * | <@discord_id> |          ← Discord mention (blue, shows server name)
 * << | .username. | >>       ← blue clickable Roblox profile link
 * Region: -
 * Stage: OLS
 * Status: Challengeable
 * wins: 0 losses: 0
 */
function fieldValue(player: any): string {
  const statusText = getStatusText(player.status as PlayerStatus);
  const profileLink = `https://www.roblox.com/users/${player.robloxId}/profile`;
  return (
    `ID: ${player.robloxId}\n` +
    `| <@${player.discordId}> |\n` +
    `<< | .[${player.robloxUsername}](${profileLink}). | >>\n` +
    `Region: **${player.region ?? '-'}**\n` +
    `Stage: **${player.stage || '-'}**\n` +
    `-# Status: ${statusText}\n` +
    `-# wins: ${player.wins} losses: ${player.losses}`
  );
}

function vacantFieldValue(): string {
  return 'ID: —\n| Vacant |\n<< | .vacant. | >>\nRegion: —\nStage: —\nStatus: Empty\nwins: 0 losses: 0';
}

async function buildEmbeds(minRank: number, maxRank: number): Promise<EmbedBuilder[]> {
  const client = (globalThis as any).client as Client | undefined;
  const players = await Player.find({ guildId: GUILD_ID, rank: { $gte: minRank, $lte: maxRank } })
    .sort({ rank: 1 })
    .lean();

  const playerMap = new Map<number, any>();
  for (const p of players) if (p.rank !== null) playerMap.set(p.rank, p);

  const embeds: EmbedBuilder[] = [];
  for (let rank = minRank; rank <= maxRank && embeds.length < 10; rank++) {
    const player = playerMap.get(rank);

    let name: string;
    if (player && client) {
      name = await fieldName(player, client);
    } else if (player) {
      name = `**#${player.rank}**  ${player.robloxUsername}`;
    } else {
      name = vacantFieldName(rank);
    }

    const embed = new EmbedBuilder()
      .setColor(player ? 0xED4245 : 0x000000)
      .setTitle(name)
      .addFields({
        name: '\u200B',
        value: player ? fieldValue(player) : vacantFieldValue(),
        inline: false,
      })
      .setImage(GIF_URL);

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
        logger.info(`Leaderboard ${lb.minRank}-${lb.maxRank}: edited (${embeds.length} embeds)`);
      } else {
        const newMsg = await channel.send({ embeds });
        messageIdCache.set(lb.channelId, newMsg.id);
        logger.info(`Leaderboard ${lb.minRank}-${lb.maxRank}: created (${embeds.length} embeds)`);
      }
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
        logger.info(`REFRESH: Leaderboard ${lb.minRank}-${lb.maxRank} created new`);
      }
    } catch (error) {
      logger.error(`REFRESH FAILED: Leaderboard ${lb.minRank}-${lb.maxRank}:`, error);
    }
  }
}
