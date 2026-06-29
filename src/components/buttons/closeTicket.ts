import type { ButtonInteraction } from 'discord.js';
import { Ticket } from '../../database/models/Ticket.js';
import { TicketStatus, type MatchOutcome } from '../../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embeds.js';
import { closeTicket } from '../../services/ticketFlow.js';
import { hasRefereePermission } from '../../utils/permissions.js';

export async function handleCloseTicketButton(interaction: ButtonInteraction): Promise<void> {
  if (!hasRefereePermission(interaction.member as any)) {
    await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees or staff can close tickets.')], ephemeral: true });
    return;
  }

  const ticket = await Ticket.findOne({
    channelId: interaction.channelId,
    status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
  });

  if (!ticket) {
    await interaction.reply({ embeds: [createErrorEmbed('Not a Ticket', 'This button can only be used in an active ticket channel.')], ephemeral: true });
    return;
  }

  // Close as invalid by default — referee should use /close-ticket for match results
  await interaction.deferReply();

  try {
    await closeTicket(interaction.client, ticket, 'INVALID' as MatchOutcome, interaction.user.id, 'Closed via Close button');
    await interaction.editReply({ embeds: [createSuccessEmbed('Ticket Closed', 'The ticket has been closed as invalid.\n\nUse `/close-ticket` for match results (Challenger Wins / Opponent Wins).')] });
  } catch (error) {
    console.error('Error closing ticket via button:', error);
    await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Failed to close ticket.')] });
  }
}
