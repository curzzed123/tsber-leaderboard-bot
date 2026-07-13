import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { Ticket } from '../../database/models/Ticket.js';
import { TicketStatus, ButtonCustomId, ModalCustomId, ModalInputCustomId, type MatchOutcome } from '../../types/index.js';
import { createErrorEmbed } from '../../utils/embeds.js';
import { resolveMatch } from '../../services/rankShift.js';
import { hasRefereePermission } from '../../utils/permissions.js';
import { logger } from '../../utils/logger.js';
import { discordLog } from '../../utils/discordLogger.js';
import { formatRank } from '../../utils/formatting.js';

export async function handleCloseTicketButton(interaction: ButtonInteraction): Promise<void> {
  if (!hasRefereePermission(interaction.member as any)) {
    await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only referees or staff can close tickets.')], ephemeral: true });
    return;
  }

  const ticket = await Ticket.findOne({
    channelId: interaction.channelId,
    status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
  });

  await interaction.deferReply();

  if (!ticket) {
    // Application/support ticket — just delete
    try {
      await interaction.editReply({ content: 'Ticket closed. Channel will be deleted shortly.' });
      setTimeout(async () => { try { await interaction.channel?.delete(); } catch {} }, 3000);
    } catch {}
    return;
  }

  // Challenge ticket
  if (ticket.claimedBy) {
    // Ticket is claimed — DM the referee with winner selection
    await sendWinnerDM(interaction, ticket);
    return;
  }

  // Not claimed — close as invalid
  try {
    await resolveMatch(ticket, 'INVALID' as MatchOutcome, interaction.user.id);
    await interaction.editReply({ content: 'Ticket closed as invalid. Channel will be deleted shortly.' });
    setTimeout(async () => { try { await interaction.channel?.delete(); } catch {} }, 3000);
  } catch (error) {
    logger.error('Error closing unclaimed ticket:', error);
    await interaction.editReply({ content: 'Failed to close ticket.' });
  }
}

async function sendWinnerDM(interaction: ButtonInteraction, ticket: any): Promise<void> {
  try {
    const { Player } = await import('../../database/models/Player.js');
    const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
    const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });

    const chName = challenger?.robloxUsername ?? 'Challenger';
    const opName = opponent?.robloxUsername ?? 'Opponent';
    const chRank = challenger?.rank ? `#${challenger.rank}` : 'Unranked';
    const opRank = opponent?.rank ? `#${opponent.rank}` : 'Unranked';
    const fightType = ticket.fightType || 'normal';

    const dmText =
      `**Select Match Winner**\n\n` +
      `**${chName}** (${chRank}) vs **${opName}** (${opRank})\n` +
      `**Type:** ${fightType === 'auto' ? 'Auto' : 'Normal'}\n\n` +
      `Select the winner below.`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`dm_win_challenger:${ticket._id}:${fightType}`).setLabel(`${chName} Wins`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`dm_win_opponent:${ticket._id}:${fightType}`).setLabel(`${opName} Wins`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`dm_invalid:${ticket._id}:${fightType}`).setLabel('Invalid').setStyle(ButtonStyle.Danger),
    );

    const dmChannel = await interaction.user.createDM();
    if (dmChannel && 'send' in dmChannel) {
      await (dmChannel as any).send({ content: dmText, components: [row] });
    }

    await interaction.editReply({ content: 'Check your DMs to select the winner.' });

    const ticketChannel = interaction.channel;
    if (ticketChannel && 'send' in ticketChannel) {
      await (ticketChannel as any).send({
        content: `The referee (<@${interaction.user.id}>) has been asked to select the winner.`,
      });
    }

    logger.info(`DM sent to referee ${interaction.user.id} for ticket ${ticket._id}`);
  } catch (error) {
    logger.error('Failed to send DM to referee:', error);
    await interaction.editReply({ content: 'Failed to send DM. Make sure your DMs are open.' });
  }
}

export async function handleDMWinnerButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const ticketId = parts[1];
  const fightType = parts[2] || 'normal';

  if (!ticketId) { await interaction.reply({ content: 'Invalid ticket reference.', ephemeral: true }); return; }

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) { await interaction.reply({ content: 'Ticket not found.', ephemeral: true }); return; }
  if (ticket.status !== TicketStatus.OPEN && ticket.status !== TicketStatus.FROZEN) {
    await interaction.reply({ content: 'This ticket is already closed.', ephemeral: true }); return;
  }

  let outcome: MatchOutcome;
  if (action === ButtonCustomId.DM_WIN_CHALLENGER) outcome = 'WIN_CHALLENGER';
  else if (action === ButtonCustomId.DM_WIN_OPPONENT) outcome = 'WIN_OPPONENT';
  else outcome = 'INVALID';

  if (outcome === 'INVALID') {
    await interaction.deferReply();
    try {
      await resolveMatch(ticket, outcome, interaction.user.id);
      await interaction.editReply({ content: 'Match closed as Invalid.' });
      await closeFightChannel(interaction.client, ticket, outcome, interaction.user.id, interaction.user.tag, '', '');
    } catch (error) {
      logger.error('Failed to resolve invalid match via DM:', error);
      await interaction.editReply({ content: 'Error resolving match.' });
    }
    return;
  }

  // Auto fight — no score, resolve immediately
  if (fightType === 'auto') {
    await interaction.deferReply();
    try {
      await resolveMatch(ticket, outcome, interaction.user.id);
      const { Player } = await import('../../database/models/Player.js');
      const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
      const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });
      const winner = outcome === 'WIN_CHALLENGER' ? challenger : opponent;
      const loser = outcome === 'WIN_CHALLENGER' ? opponent : challenger;
      const winnerName = winner?.robloxUsername ?? 'Unknown';
      const loserName = loser?.robloxUsername ?? 'Unknown';
      const winnerRank = winner?.rank ? `#${winner.rank}` : 'Unranked';

      await interaction.editReply({ content: `**Auto Win**\n**Winner:** ${winnerName} (${winnerRank})\n**Loser:** ${loserName}` });

      const SCORES_CHANNEL_ID = '1521317801091010601';
      const scoresChannel = await interaction.client.channels.fetch(SCORES_CHANNEL_ID).catch(() => null);
      if (scoresChannel && scoresChannel.isTextBased()) {
        await (scoresChannel as any).send({
          content: `**${winnerName}** def. **${loserName}**\n**Score:** Auto Win\n\n**Winner:** ${winnerName} (${winnerRank}) — ${winner?.wins}W / ${winner?.losses}L\n**Loser:** ${loserName}\n\n**Referee:** <@${interaction.user.id}>\n**Type:** Auto`,
        });
      }

      await closeFightChannel(interaction.client, ticket, outcome, interaction.user.id, interaction.user.tag, winnerName, loserName);
      await discordLog('Auto Match Resolved', `**Winner:** ${winnerName}\n**Loser:** ${loserName}\n**Referee:** <@${interaction.user.id}>`, 'success');
    } catch (error) {
      logger.error('Failed to resolve auto match:', error);
      await interaction.editReply({ content: 'Error resolving match.' });
    }
    return;
  }

  // Normal fight — show score modal
  const modal = new ModalBuilder()
    .setCustomId(`${ModalCustomId.DM_SCORE}:${ticketId}:${outcome}`)
    .setTitle('Enter Match Score');

  const scoreInput = new TextInputBuilder()
    .setCustomId(ModalInputCustomId.DM_SCORE)
    .setLabel('Score (e.g. 3-0, 3-1, 3-2)')
    .setPlaceholder('3-0')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(scoreInput);
  modal.addComponents(row);
  await interaction.showModal(modal);
}

export async function handleDMScoreModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [_, ticketId, outcomeStr] = interaction.customId.split(':');
  if (!ticketId || !outcomeStr) { await interaction.reply({ content: 'Invalid reference.', ephemeral: true }); return; }

  const score = interaction.fields.getTextInputValue(ModalInputCustomId.DM_SCORE).trim();
  const outcome = outcomeStr as MatchOutcome;

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) { await interaction.reply({ content: 'Ticket not found.', ephemeral: true }); return; }
  if (ticket.status !== TicketStatus.OPEN && ticket.status !== TicketStatus.FROZEN) {
    await interaction.reply({ content: 'This ticket is already closed.', ephemeral: true }); return;
  }

  await interaction.deferReply();

  try {
    await resolveMatch(ticket, outcome, interaction.user.id);
    const { Player } = await import('../../database/models/Player.js');
    const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
    const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });
    const winner = outcome === 'WIN_CHALLENGER' ? challenger : opponent;
    const loser = outcome === 'WIN_CHALLENGER' ? opponent : challenger;
    const winnerName = winner?.robloxUsername ?? 'Unknown';
    const loserName = loser?.robloxUsername ?? 'Unknown';
    const winnerRank = winner?.rank ? `#${winner.rank}` : 'Unranked';

    await interaction.editReply({ content: `**Match Result Confirmed**\n**Winner:** ${winnerName} (${winnerRank})\n**Loser:** ${loserName}\n**Score:** ${score}` });

    const SCORES_CHANNEL_ID = '1521317801091010601';
    const scoresChannel = await interaction.client.channels.fetch(SCORES_CHANNEL_ID).catch(() => null);
    if (scoresChannel && scoresChannel.isTextBased()) {
      await (scoresChannel as any).send({
        content: `**${winnerName}** def. **${loserName}**\n**Score:** ${score}\n\n**Winner:** ${winnerName} (${winnerRank}) — ${winner?.wins}W / ${winner?.losses}L\n**Loser:** ${loserName} — ${loser?.wins}W / ${loser?.losses}L\n\n**Referee:** <@${interaction.user.id}>\n**Type:** Normal`,
      });
    }

    await closeFightChannel(interaction.client, ticket, outcome, interaction.user.id, interaction.user.tag, winnerName, loserName);
    await discordLog('Match Resolved', `**Winner:** ${winnerName}\n**Loser:** ${loserName}\n**Score:** ${score}\n**Referee:** <@${interaction.user.id}>`, 'success');
  } catch (error) {
    logger.error('Failed to resolve match via DM score modal:', error);
    await interaction.editReply({ content: 'Error resolving match.' });
  }
}

async function closeFightChannel(client: any, ticket: any, outcome: MatchOutcome, closedById: string, closedByTag: string, winnerName: string, loserName: string): Promise<void> {
  const channelId = ticket.channelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel && channel.isTextBased()) {
    await (channel as any).send({
      content: outcome === 'INVALID' ? 'Match closed as Invalid.' : `Winner: **${winnerName}**\nLoser: **${loserName}**\nClosed by ${closedByTag}`,
    });
    setTimeout(async () => { try { await (channel as any).delete(); } catch {} }, 5000);
  }
}
