import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { ChannelType, PermissionFlagsBits, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { ButtonCustomId, ModalCustomId, ModalInputCustomId } from '../../types/index.js';
import { discordLog } from '../../utils/discordLogger.js';
import { logger } from '../../utils/logger.js';

const GUILD_ID = '1508900900381524089';
const REFEREES_ROLE_ID = '1520869356903600369';
const TICKETS_CATEGORY_ID = '1521267547150749879';

export async function handleGeneralSupportButton(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(ModalCustomId.GENERAL_SUPPORT)
    .setTitle('Open Support Ticket');

  const reasonInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.SUPPORT_REASON)
    .setLabel('What are you opening this ticket for?')
    .setPlaceholder('Brief reason for opening this ticket')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const detailsInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.SUPPORT_DETAILS)
    .setLabel('Details')
    .setPlaceholder('Explain your issue in detail...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(detailsInput);

  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}

export async function handleGeneralSupportModal(interaction: ModalSubmitInteraction): Promise<void> {
  const reason = interaction.fields.getTextInputValue(ModalInputCustomId.SUPPORT_REASON).trim();
  const details = interaction.fields.getTextInputValue(ModalInputCustomId.SUPPORT_DETAILS).trim();

  const guild = interaction.client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    await interaction.reply({ content: 'Guild not found.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const sanitize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const channelName = `support-${sanitize(interaction.user.username)}`;

  const overwrites: any[] = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: REFEREES_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
    { id: interaction.client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
  ];

  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKETS_CATEGORY_ID,
      permissionOverwrites: overwrites,
      topic: `Support — ${interaction.user.tag} — ${reason}`,
    });

    const closeBtn = new ActionRowBuilder().addComponents(
      new (await import('discord.js')).ButtonBuilder().setCustomId(ButtonCustomId.CLOSE_TICKET).setLabel('Close').setStyle((await import('discord.js')).ButtonStyle.Danger),
    ) as any;

    const embed = new EmbedBuilder()
      .setTitle('General Support Ticket')
      .setColor(0x2b2d31)
      .setDescription(
        `**User:** <@${interaction.user.id}>\n` +
        `**Reason:** ${reason}\n\n` +
        `**Details:**\n${details}`,
      )
      .setTimestamp();

    await channel.send({
      content: `<@${interaction.user.id}> <@&${REFEREES_ROLE_ID}> A support ticket has been opened!`,
      embeds: [embed],
      components: [closeBtn],
    });

    await interaction.editReply({ content: `Support ticket created! Check <#${channel.id}>.` });

    await discordLog('Support Ticket Opened', `**User:** <@${interaction.user.id}>\n**Reason:** ${reason}\n**Channel:** <#${channel.id}>`, 'info');
    logger.info(`Support ticket: ${interaction.user.id} (channel: ${channel.id})`);
  } catch (error) {
    logger.error('Failed to create support ticket:', error);
    await interaction.editReply({ content: 'Failed to create support ticket. Please try again.' });
  }
}
