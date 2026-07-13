import type { ButtonInteraction } from 'discord.js';
import { Ticket } from '../../database/models/Ticket.js';
import { Player } from '../../database/models/Player.js';
import { TicketStatus, ButtonCustomId } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { discordLog } from '../../utils/discordLogger.js';

export async function handleOpenFightButton(interaction: ButtonInteraction): Promise<void> {
  const ticketId = interaction.customId.split(':')[1];
  if (!ticketId) {
    await interaction.reply({ content: 'Invalid ticket reference.', ephemeral: true });
    return;
  }

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    await interaction.reply({ content: 'Ticket not found.', ephemeral: true });
    return;
  }

  if (ticket.status !== TicketStatus.OPEN && ticket.status !== TicketStatus.FROZEN) {
    await interaction.reply({ content: 'This ticket is already closed.', ephemeral: true });
    return;
  }

  if (ticket.claimedBy !== interaction.user.id) {
    await interaction.reply({ content: 'Only the referee who claimed this ticket can open the fight.', ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

    const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
    const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });
    const chName = challenger?.robloxUsername ?? 'Challenger';
    const opName = opponent?.robloxUsername ?? 'Opponent';
    const chRank = challenger?.rank ? `#${challenger.rank}` : 'Unranked';
    const opRank = opponent?.rank ? `#${opponent.rank}` : 'Unranked';
    const fightType = ticket.fightType || 'normal';

    // Send the fight start message in the ticket channel
    const channel = await interaction.client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      const closeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ButtonCustomId.CLOSE_TICKET).setLabel('Close').setStyle(ButtonStyle.Danger),
      );

      await (channel as any).send({
        content:
          `<@${ticket.challengerDiscordId}> <@${ticket.opponentDiscordId}> <@&${'1520869356903600369'}> The fight is starting now!\n\n` +
          `**${chName}** (${chRank}) vs **${opName}** (${opRank})\n` +
          `**Type:** ${fightType === 'auto' ? 'Auto' : 'Normal'}\n` +
          `**Referee:** <@${ticket.claimedBy}>`,
        components: [closeButton],
      });
    }

    await interaction.editReply({ content: 'Fight opened in the ticket channel.' });

    await discordLog('Fight Opened', `**Challenger:** ${chName}\n**Opponent:** ${opName}\n**Type:** ${fightType}\n**Channel:** <#${ticket.channelId}>`, 'info');
    logger.info(`Fight opened for ticket ${ticket._id} by ${interaction.user.id}`);
  } catch (error) {
    logger.error('Failed to open fight:', error);
    await interaction.editReply({ content: 'Failed to open fight.' });
  }
}
