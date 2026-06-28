import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Ticket } from '../database/models/Ticket.js';
import { TicketStatus } from '../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { resolveMatch } from '../services/rankShift.js';
import { hasStaffPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { refreshLeaderboard } from '../services/leaderboard.js';

export const forcewin: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('forcewin')
    .setDescription('Force a win for a specific user in an active ticket')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to award the win to').setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!hasStaffPermission(interaction.member as any)) {
      await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only staff (Administrator) can use this command.')], ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);

    const ticket = await Ticket.findOne({
      $or: [
        { challengerDiscordId: targetUser.id },
        { opponentDiscordId: targetUser.id },
      ],
      status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
    });

    if (!ticket) {
      await interaction.reply({ embeds: [createErrorEmbed('No Active Ticket', `${targetUser.username} does not have an active challenge ticket.`)], ephemeral: true });
      return;
    }

    const outcome = ticket.challengerDiscordId === targetUser.id ? 'WIN_CHALLENGER' : 'WIN_OPPONENT';

    await interaction.deferReply();

    try {
      await resolveMatch(ticket, outcome, interaction.user.id);
      await refreshLeaderboard(ticket.guildId);

      const embed = createSuccessEmbed(
        'Force Win Applied',
        `**${targetUser.username}** has been awarded the win.\n\n**Challenger:** <@${ticket.challengerDiscordId}>\n**Opponent:** <@${ticket.opponentDiscordId}>\n**Outcome:** ${outcome === 'WIN_CHALLENGER' ? 'Challenger Wins' : 'Opponent Wins'}`,
      );

      await interaction.editReply({ embeds: [embed] });
      logger.info(`/forcewin used by ${interaction.user.id} for ${targetUser.id} — outcome: ${outcome}`);
    } catch (error) {
      logger.error('Error in /forcewin:', error);
      await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Failed to apply force win. Check logs for details.')] });
    }
  },
};
