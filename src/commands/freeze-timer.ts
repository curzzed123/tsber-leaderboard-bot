import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Ticket } from '../database/models/Ticket.js';
import { TicketStatus } from '../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasRefereePermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { toggleFreezeTicket } from '../services/ticketFlow.js';

export const freezeTimer: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('freeze-timer')
    .setDescription('Freeze or unfreeze the challenge timer in this ticket channel')
    .addBooleanOption((option) =>
      option.setName('freeze')
        .setDescription('True to freeze, false to unfreeze (leave empty to toggle)')
        .setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!hasRefereePermission(interaction.member as any)) {
      await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees or staff can use this command.')], ephemeral: true });
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

    const explicitFreeze = interaction.options.getBoolean('freeze');
    if (explicitFreeze !== null && explicitFreeze === ticket.frozen) {
      await interaction.reply({
        embeds: [createErrorEmbed('Already Set', `The timer is already ${ticket.frozen ? 'frozen' : 'unfrozen'}.`)],
        ephemeral: true,
      });
      return;
    }

    const nowFrozen = await toggleFreezeTicket(ticket);

    const embed = createSuccessEmbed(
      nowFrozen ? '⏸️ Timer Frozen' : '▶️ Timer Resumed',
      nowFrozen
        ? 'The dodge and inactivity timers have been frozen. Use `/freeze-timer` again to resume.'
        : 'The timers have been resumed. Deadlines have been recalculated.',
    );

    await interaction.reply({ embeds: [embed] });
    logger.info(`/freeze-timer used by ${interaction.user.id} in ticket ${ticket._id} — frozen: ${nowFrozen}`);
  },
};
