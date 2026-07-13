import { EmbedBuilder, TextChannel, type Client, type Role } from 'discord.js';
import { logger } from '../utils/logger.js';

const GUILD_ID = '1508900900381524089';
const STAFF_LIST_CHANNEL_ID = '1509243182544846858';

export async function setupStaffList(client: Client): Promise<void> {
  const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
  if (!guild) {
    logger.error('Guild not found for staff list');
    return;
  }

  // Fetch all roles
  await guild.roles.fetch();

  // Filter roles with administrator permission, a color, and an icon
  const adminRoles = guild.roles.cache.filter((role: Role) =>
    role.permissions.has('Administrator') &&
    role.name !== '@everyone' &&
    role.name !== 'new role' &&
    role.color !== 0 && // must have a color
    role.icon !== null && // must have an icon
    role.members.size > 0 // must have at least one member
  ).sort((a: Role, b: Role) => b.position - a.position);

  if (adminRoles.size === 0) {
    logger.warn('No admin roles with color and icon found');
    return;
  }

  // Build the embed
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Staff Team')
    .setTimestamp();

  let description = '';
  for (const role of adminRoles.values()) {
    const members = role.members.map(m => `<@${m.id}>`).join('\n');
    if (members) {
      description += `\n<@&${role.id}>\n${members}\n`;
    }
  }

  embed.setDescription(description || 'No staff found.');

  // Send or edit in the channel
  const channel = await client.channels.fetch(STAFF_LIST_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    logger.error(`Staff list channel ${STAFF_LIST_CHANNEL_ID} not found`);
    return;
  }

  const textChannel = channel as TextChannel;
  const messages = await textChannel.messages.fetch({ limit: 5 });
  const botMsg = messages.find(m => m.author.id === client.user!.id && m.embeds.length > 0);

  if (botMsg) {
    await botMsg.edit({ embeds: [embed] });
    logger.info('Staff list edited');
  } else {
    await textChannel.send({ embeds: [embed] });
    logger.info('Staff list created');
  }
}
