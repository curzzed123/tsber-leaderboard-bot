import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextChannel, type Client } from 'discord.js';
import { getGuildConfig } from '../database/models/GuildConfig.js';
import { ButtonCustomId } from '../types/index.js';
import { logger } from '../utils/logger.js';

// Hardcoded — always works
const TICKETS_CHANNEL_ID = '1509211671464513547';

export async function setupTicketPanel(client: Client, _guildId: string): Promise<void> {
  const channel = await client.channels.fetch(TICKETS_CHANNEL_ID) as TextChannel;
  if (!channel || !(channel instanceof TextChannel)) {
    logger.error(`Tickets channel ${TICKETS_CHANNEL_ID} not found or not a text channel`);
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

  // Try to find existing bot message
  const messages = await channel.messages.fetch({ limit: 20 });
  const botMsg = messages.find((m) => m.author.id === client.user!.id && m.embeds.length > 0);

  if (botMsg) {
    await botMsg.edit({ embeds: [embed], components: [row] });
    logger.info(`Ticket panel updated (message ${botMsg.id})`);
  } else {
    const message = await channel.send({ embeds: [embed], components: [row] });
    logger.info(`Ticket panel created (message ${message.id})`);
  }
}
