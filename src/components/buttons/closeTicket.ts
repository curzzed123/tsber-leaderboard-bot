import type { ButtonInteraction } from 'discord.js';
import { Ticket } from '../../database/models/Ticket.js';
import { TicketStatus, type MatchOutcome } from '../../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embeds.js';
import { closeTicket } from '../../services/ticketFlow.js';
import { hasRefereePermission } from '../../utils/permissions.js';
import { logger } from '../../utils/logger.js';
import { discordLog } from '../../utils/discordLogger.js';

export async function handleCloseTicketButton(interaction: ButtonInteraction): Promise<void> {
  if (!hasRefereePermission(interaction.member as any)) {
    await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees or staff can close tickets.')], ephemeral: true });
    return;
  }

  // Check if this is a challenge ticket (has a DB record)
  const ticket = await Ticket.findOne({
    channelId: interaction.channelId,
    status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
  });

  await interaction.deferReply();

  if (ticket) {
    // Challenge ticket — close as invalid
    try {
      await closeTicket(interaction.client, ticket, 'INVALID' as MatchOutcome, interaction.user.id, 'Closed via Close button');
      await interaction.editReply({ embeds: [createSuccessEmbed('Ticket Closed', 'The ticket has been closed.\n\nUse `/close-ticket` for match results (Challenger Wins / Opponent Wins).')] });
    } catch (error) {
      logger.error('Error closing challenge ticket via button:', error);
      await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Failed to close ticket.')] });
    }
  } else {
    // Application ticket — just delete the channel
    try {
      await interaction.editReply({ embeds: [createSuccessEmbed('Ticket Closed', 'This ticket has been closed. The channel will be deleted shortly.')] });

      await discordLog('Application Ticket Closed', `**Channel:** <#${interaction.channelId}>\n**Closed by:** <@${interaction.user.id}>`, 'info');

      setTimeout(async () => {
        try {
          const ch = interaction.channel;
          if (ch) await ch.delete();
        } catch {
          // Channel might already be deleted
        }
      }, 3000);
    } catch (error) {
      logger.error('Error closing application ticket via button:', error);
    }
  }
}
