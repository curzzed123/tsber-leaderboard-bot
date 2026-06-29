import type { ButtonInteraction } from 'discord.js';
import { Ticket } from '../../database/models/Ticket.js';
import { TicketStatus } from '../../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embeds.js';
import { discordLog } from '../../utils/discordLogger.js';

const REFEREES_ROLE_ID = '1520869356903600369';

export async function handleClaimTicketButton(interaction: ButtonInteraction): Promise<void> {
  // Only referees can claim
  const member = interaction.member;
  if (!member || !('roles' in member)) {
    await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees can claim tickets.')], ephemeral: true });
    return;
  }

  if (!(member.roles as any).cache.has(REFEREES_ROLE_ID) && !(member as any).permissions?.has('Administrator')) {
    await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees can claim tickets.')], ephemeral: true });
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

  await interaction.reply({
    embeds: [createSuccessEmbed('Ticket Claimed', `This ticket has been claimed by <@${interaction.user.id}>.\n\nThe referee is now present and monitoring this match.`)],
  });

  await discordLog('Ticket Claimed', `**Referee:** <@${interaction.user.id}>\n**Channel:** <#${interaction.channelId}>`, 'info');
}
