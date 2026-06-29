import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Ticket } from '../database/models/Ticket.js';
import { TicketStatus, type MatchOutcome } from '../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasRefereePermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { closeTicket } from '../services/ticketFlow.js';
import { discordLog } from '../utils/discordLogger.js';

export const closeTicketCmd: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('close-ticket')
    .setDescription('Close the current ticket and report the match result')
    .addStringOption((option) =>
      option.setName('outcome')
        .setDescription('The match outcome')
        .setRequired(true)
        .addChoices(
          { name: 'Challenger Wins', value: 'WIN_CHALLENGER' },
          { name: 'Opponent Wins', value: 'WIN_OPPONENT' },
          { name: 'Invalid / No Show', value: 'INVALID' },
        ),
    )
    .addStringOption((option) =>
      option.setName('reason')
        .setDescription('Optional reason for closing')
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!hasRefereePermission(interaction.member as any)) {
      await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees or staff can close tickets.')], ephemeral: true });
      return;
    }

    const ticket = await Ticket.findOne({
      channelId: interaction.channelId,
      status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
    });

    if (!ticket) {
      await interaction.reply({ embeds: [createErrorEmbed('Not a Ticket', 'This command can only be used in an active ticket channel.')], ephemeral: true });
      return;
    }

    const outcome = interaction.options.getString('outcome', true) as MatchOutcome;
    const reason = interaction.options.getString('reason') ?? undefined;

    await interaction.deferReply();

    try {
      await closeTicket(interaction.client, ticket, outcome, interaction.user.id, reason);

      const outcomeText: Record<MatchOutcome, string> = {
        WIN_CHALLENGER: 'Challenger Wins',
        WIN_OPPONENT: 'Opponent Wins',
        INVALID: 'Invalid',
      };

      const embed = createSuccessEmbed('Ticket Closed', `**Outcome:** ${outcomeText[outcome]}\n\nThe ticket channel will be deleted shortly.`);
      if (reason) embed.addFields({ name: 'Reason', value: reason });

      await interaction.editReply({ embeds: [embed] });
      logger.info(`/close-ticket used by ${interaction.user.id} in ticket ${ticket._id} — outcome: ${outcome}`);
      await discordLog('Ticket Closed', `**Outcome:** ${outcome}\n**Challenger:** <@${ticket.challengerDiscordId}>\n**Opponent:** <@${ticket.opponentDiscordId}>\n**By:** <@${interaction.user.id}>`, 'info');
    } catch (error) {
      logger.error('Error in /close-ticket:', error);
      await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Failed to close ticket. Check logs for details.')] });
    }
  },
};
