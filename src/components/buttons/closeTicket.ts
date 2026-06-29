import type { ButtonInteraction } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { Ticket } from '../../database/models/Ticket.js';
import { TicketStatus, ButtonCustomId, type MatchOutcome } from '../../types/index.js';
import { createErrorEmbed } from '../../utils/embeds.js';
import { resolveMatch } from '../../services/rankShift.js';
import { hasRefereePermission } from '../../utils/permissions.js';
import { logger } from '../../utils/logger.js';
import { discordLog } from '../../utils/discordLogger.js';
import { formatRank } from '../../utils/formatting.js';

/**
 * Handle the Close button click on a challenge ticket.
 * Instead of immediately closing, sends the referee a DM with winner selection buttons.
 */
export async function handleCloseTicketButton(interaction: ButtonInteraction): Promise<void> {
  if (!hasRefereePermission(interaction.member as any)) {
    await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees or staff can close tickets.')], ephemeral: true });
    return;
  }

  // Check if this is a challenge ticket
  const ticket = await Ticket.findOne({
    channelId: interaction.channelId,
    status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
  });

  await interaction.deferReply();

  if (!ticket) {
    // Application ticket — just delete the channel
    try {
      await interaction.editReply({ content: 'Ticket closed. Channel will be deleted shortly.' });
      await discordLog('Application Ticket Closed', `**Channel:** <#${interaction.channelId}>\n**Closed by:** <@${interaction.user.id}>`, 'info');
      setTimeout(async () => {
        try { await interaction.channel?.delete(); } catch {}
      }, 3000);
    } catch (error) {
      logger.error('Error closing application ticket:', error);
    }
    return;
  }

  // Challenge ticket — DM the referee with winner selection buttons
  try {
    // Get player names for the DM
    const { Player } = await import('../../database/models/Player.js');
    const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
    const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });

    const chName = challenger?.robloxUsername ?? 'Challenger';
    const opName = opponent?.robloxUsername ?? 'Opponent';
    const chRank = challenger?.rank ? `#${challenger.rank}` : 'Unranked';
    const opRank = opponent?.rank ? `#${opponent.rank}` : 'Unranked';

    const dmEmbed = new EmbedBuilder()
      .setTitle('Select Match Winner')
      .setColor(0x5865F2)
      .setDescription(
        `**Challenger:** ${chName} (${chRank})\n` +
        `**Opponent:** ${opName} (${opRank})\n\n` +
        `Select the winner of this match.\n` +
        `If the winner is ranked lower (challenger), ranks will swap and the loser drops 1 position.\n` +
        `If the winner is ranked higher (opponent), ranks stay the same. Winner gets +1 win, loser gets +1 loss.`,
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${ButtonCustomId.DM_WIN_CHALLENGER}:${ticket._id}`).setLabel(`${chName} (Challenger) Wins`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${ButtonCustomId.DM_WIN_OPPONENT}:${ticket._id}`).setLabel(`${opName} (Opponent) Wins`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${ButtonCustomId.DM_INVALID}:${ticket._id}`).setLabel('Invalid').setStyle(ButtonStyle.Danger),
    );

    // Send DM to the referee
    const dmChannel = await interaction.user.createDM();
    if (dmChannel && 'send' in dmChannel) {
      await (dmChannel as any).send({ embeds: [dmEmbed], components: [row] });
    } else {
      throw new Error('Could not open DM channel');
    }

    await interaction.editReply({ content: 'Check your DMs to select the match winner.' });

    // Also announce in the ticket channel
    const ticketChannel = interaction.channel;
    if (ticketChannel && 'send' in ticketChannel) {
      await (ticketChannel as any).send({
        embeds: [new EmbedBuilder()
          .setTitle('Match Result Pending')
          .setColor(0xFEE75C)
          .setDescription(`The referee (<@${interaction.user.id}>) has been asked to select the winner.\nThe ticket will close once the result is confirmed.`)
          .setTimestamp()],
      });
    }

    logger.info(`DM sent to referee ${interaction.user.id} for ticket ${ticket._id}`);
  } catch (error) {
    logger.error('Failed to send DM to referee:', error);
    await interaction.editReply({ content: 'Failed to send DM. Make sure your DMs are open. You can also use /close-ticket.' });
  }
}

/**
 * Handle the winner selection buttons from the DM.
 */
export async function handleDMWinnerButton(interaction: ButtonInteraction): Promise<void> {
  // This is a DM interaction — customId format is "dm_win_challenger:TICKET_ID"
  const [action, ticketId] = interaction.customId.split(':');

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

  let outcome: MatchOutcome;
  if (action === ButtonCustomId.DM_WIN_CHALLENGER) {
    outcome = 'WIN_CHALLENGER';
  } else if (action === ButtonCustomId.DM_WIN_OPPONENT) {
    outcome = 'WIN_OPPONENT';
  } else {
    outcome = 'INVALID';
  }

  await interaction.deferReply();

  try {
    // Resolve the match
    await resolveMatch(ticket, outcome, interaction.user.id);

    // Get result details for the DM confirmation
    const { Player } = await import('../../database/models/Player.js');
    const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
    const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });

    const resultEmbed = new EmbedBuilder()
      .setTitle('Match Result Confirmed')
      .setColor(outcome === 'INVALID' ? 0xED4245 : 0x57F287)
      .setDescription(
        outcome === 'INVALID' ? 'Match closed as Invalid.' :
        outcome === 'WIN_CHALLENGER'
          ? `**Winner (Challenger):** ${challenger?.robloxUsername} — now ${challenger?.rank ? `#${challenger.rank}` : 'Unranked'} (${challenger?.wins}W / ${challenger?.losses}L)\n**Loser (Opponent):** ${opponent?.robloxUsername} — now ${opponent?.rank ? `#${opponent.rank}` : 'Unranked'} (${opponent?.wins}W / ${opponent?.losses}L)`
          : `**Winner (Opponent):** ${opponent?.robloxUsername} — ${opponent?.rank ? `#${opponent.rank}` : 'Unranked'} (${opponent?.wins}W / ${opponent?.losses}L)\n**Loser (Challenger):** ${challenger?.robloxUsername} — ${challenger?.rank ? `#${challenger.rank}` : 'Unranked'} (${challenger?.wins}W / ${challenger?.losses}L)`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [resultEmbed] });

    // Close the ticket channel
    const client = interaction.client;
    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      await (channel as any).send({
        embeds: [new EmbedBuilder()
          .setTitle('Ticket Closed')
          .setColor(0x57F287)
          .setDescription(
            outcome === 'INVALID' ? 'Match closed as Invalid.' :
            outcome === 'WIN_CHALLENGER'
              ? `Winner: **${challenger?.robloxUsername}**\nLoser: **${opponent?.robloxUsername}**`
              : `Winner: **${opponent?.robloxUsername}**\nLoser: **${challenger?.robloxUsername}**`
          )
          .setFooter({ text: `Closed by ${interaction.user.tag}` })
          .setTimestamp()],
      });

      setTimeout(async () => {
        try { await (channel as any).delete(); } catch {}
      }, 5000);
    }

    // Log to log channel
    const winnerName = outcome === 'WIN_CHALLENGER' ? challenger?.robloxUsername : opponent?.robloxUsername;
    const loserName = outcome === 'WIN_CHALLENGER' ? opponent?.robloxUsername : challenger?.robloxUsername;
    await discordLog('Match Resolved',
      `**Winner:** ${winnerName}\n**Loser:** ${loserName}\n**Outcome:** ${outcome}\n**Referee:** <@${interaction.user.id}>`,
      'success');

    logger.info(`Ticket ${ticket._id} resolved via DM as ${outcome} by ${interaction.user.id}`);
  } catch (error) {
    logger.error('Failed to resolve match via DM:', error);
    await interaction.editReply({ content: 'Error resolving match. Use /close-ticket instead.' });
  }
}
