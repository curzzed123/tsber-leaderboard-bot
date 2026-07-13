import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, type Client } from 'discord.js';
import { logger } from '../utils/logger.js';

const PING_ROLES_CHANNEL_ID = '1526017021559701674';
const GUILD_ID = '1508900900381524089';

// Ping roles — button customId is the role ID
const PING_ROLES = [
  { label: 'Hall of Fame and Shame', roleId: '1526017704524468304', emoji: '💀' },
  { label: 'Sparring', roleId: '1526017863123664956', emoji: '💪' },
  { label: 'Giveaways', roleId: '1526017940316319765', emoji: '🎉' },
  { label: 'Gamenights', roleId: '1526018018285101146', emoji: '📺' },
  { label: 'Content', roleId: '1526018101246009495', emoji: '▶️' },
  { label: 'Training', roleId: '1526018186768777276', emoji: '🎓' },
  { label: 'Tryout', roleId: '1526018267999305758', emoji: '✏️' },
];

export async function setupPingRoles(client: Client): Promise<void> {
  const channel = await client.channels.fetch(PING_ROLES_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    logger.error(`Ping roles channel ${PING_ROLES_CHANNEL_ID} not found`);
    return;
  }
  const textChannel = channel as TextChannel;

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle('Ping Roles')
    .setDescription(
      '↓ Select the ping roles you want by pressing the buttons below.\n' +
      'You can choose multiple roles to get notified about the updates and events you care about.',
    );

  // Row 1: first 4 roles
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    PING_ROLES.slice(0, 4).map(r =>
      new ButtonBuilder()
        .setCustomId(`pingrole:${r.roleId}`)
        .setLabel(r.label)
        .setEmoji(r.emoji)
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  // Row 2: next 1 role
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    PING_ROLES.slice(4, 5).map(r =>
      new ButtonBuilder()
        .setCustomId(`pingrole:${r.roleId}`)
        .setLabel(r.label)
        .setEmoji(r.emoji)
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  // Row 3: last 2 roles
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    PING_ROLES.slice(5, 7).map(r =>
      new ButtonBuilder()
        .setCustomId(`pingrole:${r.roleId}`)
        .setLabel(r.label)
        .setEmoji(r.emoji)
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  // Find existing bot message
  const messages = await textChannel.messages.fetch({ limit: 20 });
  const botMsg = messages.find((m) => m.author.id === client.user!.id && m.embeds.length > 0);

  if (botMsg) {
    await botMsg.edit({ embeds: [embed], components: [row1, row2, row3] });
    logger.info(`Ping roles panel edited (message ${botMsg.id})`);
  } else {
    const message = await textChannel.send({ embeds: [embed], components: [row1, row2, row3] });
    logger.info(`Ping roles panel created (message ${message.id})`);
  }
}

/**
 * Handle ping role button click — toggle the role
 */
export async function handlePingRoleButton(interaction: any): Promise<void> {
  const roleId = interaction.customId.split(':')[1];
  if (!roleId) return;

  const guild = interaction.client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  const hasRole = member.roles.cache.has(roleId);

  try {
    if (hasRole) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: `Removed <@&${roleId}>.`, ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: `Added <@&${roleId}>.`, ephemeral: true });
    }
  } catch (error) {
    await interaction.reply({ content: 'Failed to update role. Make sure my role is high enough.', ephemeral: true });
  }
}
