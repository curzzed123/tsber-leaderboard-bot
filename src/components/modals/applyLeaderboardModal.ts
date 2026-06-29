import type { ModalSubmitInteraction } from 'discord.js';
import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { Region, ModalInputCustomId } from '../../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embeds.js';
import { discordLog } from '../../utils/discordLogger.js';
import { logger } from '../../utils/logger.js';

const GUILD_ID = '1508900900381524089';
const REFEREES_ROLE_ID = '1520869356903600369';
const TICKETS_CATEGORY_ID = '';

export async function handleApplyLeaderboardModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ embeds: [createErrorEmbed('Error', 'This can only be used in a server.')], ephemeral: true });
    return;
  }

  const robloxUsername = interaction.fields.getTextInputValue(ModalInputCustomId.APPLY_ROBLOX_USERNAME).trim();
  const regionInput = interaction.fields.getTextInputValue(ModalInputCustomId.APPLY_REGION).trim().toUpperCase();
  const experience = interaction.fields.getTextInputValue(ModalInputCustomId.APPLY_EXPERIENCE).trim();

  // Validate region
  const validRegions = Object.values(Region);
  if (!validRegions.includes(regionInput as Region)) {
    await interaction.reply({
      embeds: [createErrorEmbed('Invalid Region', `Region must be one of: ${validRegions.join(', ')}`)],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Guild not found.')] });
    return;
  }

  // Sanitize username for channel name
  const sanitize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const channelName = `apply-${sanitize(robloxUsername)}`;

  // Create the application ticket channel
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
      parent: '1521267547150749879',
      permissionOverwrites: overwrites,
      topic: `Leaderboard Application: ${robloxUsername} — ${interaction.user.tag}`,
    });

    // Send the application embed
    const embed = new EmbedBuilder()
      .setTitle('Leaderboard Application')
      .setColor(0x5865F2)
      .setDescription(
        `**Applicant:** <@${interaction.user.id}>\n` +
        `**Roblox Username:** ${robloxUsername}\n` +
        `**Region:** ${regionInput}\n\n` +
        `**Experience / Reason:**\n${experience}`,
      )
      .setTimestamp()
      .setFooter({ text: 'Staff can use /setrank to place this player if accepted' });

    await channel.send({
      content: `<@${interaction.user.id}> <@&${REFEREES_ROLE_ID}> A new leaderboard application has been submitted!`,
      embeds: [embed],
    });

    await interaction.editReply({
      embeds: [createSuccessEmbed(
        'Application Submitted',
        `Your leaderboard application has been submitted!\n\n**Ticket channel:** <#${channel.id}>\n\nStaff will review your application and assign you a rank if accepted.`,
      )],
    });

    await discordLog('Leaderboard Application', `**Applicant:** ${robloxUsername} — <@${interaction.user.id}>\n**Region:** ${regionInput}\n**Channel:** <#${channel.id}>`, 'info');
    logger.info(`Leaderboard application: ${robloxUsername} by ${interaction.user.id} (channel: ${channel.id})`);
  } catch (error) {
    logger.error('Failed to create application ticket:', error);
    await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Failed to create application ticket. Please try again or contact staff.')] });
  }
}
