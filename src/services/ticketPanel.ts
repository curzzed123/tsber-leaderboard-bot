import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, type Client } from 'discord.js';
import { getGuildConfig } from '../database/models/GuildConfig.js';
import { ButtonCustomId } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Send or update the persistent ticket panel message with [Create] and [Challenge] buttons.
 * The message ID is stored in GuildConfig for future reference.
 * Buttons are persistent — they work across bot restarts.
 */
export async function setupTicketPanel(client: Client, guildId: string): Promise<void> {
  const guildConfig = await getGuildConfig(guildId);

  if (!guildConfig.ticketsChannelId) {
    logger.warn(`No tickets channel ID set for guild ${guildId}`);
    return;
  }

  const channel = await client.channels.fetch(guildConfig.ticketsChannelId);
  if (!channel || !(channel instanceof TextChannel)) {
    logger.error(`Tickets channel ${guildConfig.ticketsChannelId} not found or not a text channel`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🎫 Challenge Tickets')
    .setColor(0x5865F2)
    .setDescription(
      '**Welcome to the TSBER Challenge System!**\n\n' +
      '**Create** — Register your profile with Roblox verification to join the leaderboard.\n' +
      '**Challenge** — Select an eligible opponent to challenge and start a match ticket.\n\n' +
      'Click a button below to get started.',
    )
    .setFooter({ text: 'Persistent buttons • Work even after bot restarts' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ButtonCustomId.CREATE_PROFILE)
      .setLabel('Create')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId(ButtonCustomId.CHALLENGE)
      .setLabel('Challenge')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⚔️'),
  );

  // If we already have a message ID, try to edit it; otherwise send new
  if (guildConfig.ticketsEmbedMessageId) {
    try {
      const message = await channel.messages.fetch(guildConfig.ticketsEmbedMessageId);
      await message.edit({ embeds: [embed], components: [row] });
      logger.info('Ticket panel message updated');
      return;
    } catch {
      logger.warn('Existing ticket panel message not found, creating new one');
    }
  }

  const message = await channel.send({ embeds: [embed], components: [row] });
  guildConfig.ticketsEmbedMessageId = message.id;
  await guildConfig.save();
  logger.info(`Ticket panel message created (ID: ${message.id})`);
}
