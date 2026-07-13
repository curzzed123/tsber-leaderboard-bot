import { TextChannel, type Client, type Role } from 'discord.js';
import { logger } from '../utils/logger.js';

const GUILD_ID = '1508900900381524089';
const STAFF_LIST_CHANNEL_ID = '1509243182544846858';

// Staff roles to display — top to bottom hierarchy
const STAFF_ROLE_NAMES = [
  'Monarch',
  'Founders',
  'Co-Founders',
  'Apex',
  'Right Wing',
  'Left Wing',
  'Server Overseer',
  'Halos',
  'High Ranked Supervisor',
  'Administrator',
  'Moderator',
  'Lead Helper',
  'Helpers',
  'Councilors',
];

export async function setupStaffList(client: Client): Promise<void> {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    logger.error('Guild not found for staff list');
    return;
  }

  await guild.roles.fetch();

  // Build plain text — no embed
  let text = '';

  for (const roleName of STAFF_ROLE_NAMES) {
    // Case-insensitive role name match
    const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (!role) continue;

    const members = role.members.map(m => `<@${m.id}>`).join(', ');
    if (members) {
      text += `**${role.name}** — ${members}\n`;
    }
  }

  if (!text) {
    logger.warn('No staff roles found with members');
    return;
  }

  const channel = await client.channels.fetch(STAFF_LIST_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    logger.error(`Staff list channel ${STAFF_LIST_CHANNEL_ID} not found`);
    return;
  }

  const textChannel = channel as TextChannel;
  const messages = await textChannel.messages.fetch({ limit: 10 });
  // Find bot's plain text message (no embeds)
  const botMsg = messages.find(m => m.author.id === client.user!.id && m.embeds.length === 0);

  if (botMsg) {
    await botMsg.edit({ content: text });
    logger.info('Staff list edited');
  } else {
    // Delete old embed messages from bot first
    const oldEmbedMsg = messages.find(m => m.author.id === client.user!.id && m.embeds.length > 0);
    if (oldEmbedMsg) {
      try { await oldEmbedMsg.delete(); } catch {}
    }
    await textChannel.send({ content: text });
    logger.info('Staff list created');
  }
}
