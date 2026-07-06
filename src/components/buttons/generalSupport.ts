import type { ButtonInteraction } from 'discord.js';
import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { ButtonCustomId } from '../../types/index.js';
import { createErrorEmbed } from '../../utils/embeds.js';
import { discordLog } from '../../utils/discordLogger.js';
import { logger } from '../../utils/logger.js';

const GUILD_ID = '1508900900381524089';
const REFEREES_ROLE_ID = '1520869356903600369';
const TICKETS_CATEGORY_ID = '1521267547150749879';
const SUPPORT_CHANNEL_ID = '1511290951434371134';

export async function handleGeneralSupportButton(interaction: ButtonInteraction): Promise<void> {
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
      topic: `General Support — ${interaction.user.tag}`,
    });

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const closeBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(ButtonCustomId.CLOSE_TICKET).setLabel('Close').setStyle(ButtonStyle.Danger),
    ) as any;

    const embed = new EmbedBuilder()
      .setTitle('General Support Ticket')
      .setColor(0x5865F2)
      .setDescription(
        `**User:** <@${interaction.user.id}>\n\n` +
        `Describe your issue and a staff member will assist you shortly.`,
      )
      .setTimestamp();

    await channel.send({
      content: `<@${interaction.user.id}> <@&${REFEREES_ROLE_ID}> A general support ticket has been opened!`,
      embeds: [embed],
      components: [closeBtn],
    });

    await interaction.editReply({ content: `Support ticket created! Check <#${channel.id}>.` });

    await discordLog('Support Ticket Opened', `**User:** <@${interaction.user.id}>\n**Channel:** <#${channel.id}>`, 'info');
    logger.info(`Support ticket: ${interaction.user.id} (channel: ${channel.id})`);
  } catch (error) {
    logger.error('Failed to create support ticket:', error);
    await interaction.editReply({ content: 'Failed to create support ticket. Please try again.' });
  }
}
