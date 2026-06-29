import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasStaffPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { refreshLeaderboard } from '../services/leaderboard.js';
import { discordLog } from '../utils/discordLogger.js';
import { discordTimestampFull } from '../utils/formatting.js';

export const approveLoa: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('approve-loa')
    .setDescription('Approve a Leave of Absence for a player')
    .addUserOption((option) =>
      option.setName('user').setDescription('The player to grant LOA to').setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('days')
        .setDescription('Number of days for the LOA (default: 7)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(90),
    )
    .addStringOption((option) =>
      option.setName('reason')
        .setDescription('Reason for the LOA')
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!hasStaffPermission(interaction.member as any)) {
      await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only staff (Administrator) can use this command.')], ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const days = interaction.options.getInteger('days') ?? 7;
    const reason = interaction.options.getString('reason') ?? 'Approved by staff';

    const guildId = interaction.guildId!;

    const player = await Player.findOne({ guildId, discordId: targetUser.id });
    if (!player) {
      await interaction.reply({ embeds: [createErrorEmbed('Player Not Found', `${targetUser.username} is not registered.`)], ephemeral: true });
      return;
    }

    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    player.loa = {
      approved: true,
      until,
      reason,
    };
    await player.save();
    await refreshLeaderboard(guildId);

    const embed = createSuccessEmbed(
      'LOA Approved',
      `**${player.robloxUsername}** has been granted a Leave of Absence.\n\n**Duration:** ${days} days\n**Until:** ${discordTimestampFull(until)}\n**Reason:** ${reason}`,
    );

    await interaction.reply({ embeds: [embed] });
    logger.info(`/approve-loa used by ${interaction.user.id} on ${targetUser.id} for ${days} days`);
    await discordLog('LOA Approved', `**Player:** ${player.robloxUsername}\n**Duration:** ${days} days\n**Reason:** ${reason}\n**By:** <@${interaction.user.id}>`, 'info');
  },
};
