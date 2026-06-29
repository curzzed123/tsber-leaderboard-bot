import type { ModalSubmitInteraction } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { Ticket } from '../../database/models/Ticket.js';
import { Player } from '../../database/models/Player.js';
import { TicketStatus, ModalInputCustomId } from '../../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embeds.js';
import { discordLog } from '../../utils/discordLogger.js';
import { logger } from '../../utils/logger.js';
import { formatRank, discordTimestampFull } from '../../utils/formatting.js';

const ANNOUNCE_CHANNEL_ID = '1521271203476537484';
const REFEREES_ROLE_ID = '1520869356903600369';

export async function handleClaimTicketModal(interaction: ModalSubmitInteraction): Promise<void> {
  const fightTimeStr = interaction.fields.getTextInputValue(ModalInputCustomId.CLAIM_FIGHT_TIME).trim();
  const fightType = interaction.fields.getTextInputValue(ModalInputCustomId.CLAIM_FIGHT_TYPE).trim().toLowerCase();
  const ampm = interaction.fields.getTextInputValue(ModalInputCustomId.CLAIM_AM_PM).trim().toUpperCase();

  if (fightType !== 'auto' && fightType !== 'normal') {
    await interaction.reply({ embeds: [createErrorEmbed('Invalid Type', 'Fight type must be "auto" or "normal".')], ephemeral: true });
    return;
  }

  if (ampm !== 'AM' && ampm !== 'PM') {
    await interaction.reply({ embeds: [createErrorEmbed('Invalid AM/PM', 'Must be "AM" or "PM".')], ephemeral: true });
    return;
  }

  // Parse the date with AM/PM — format: YYYY-MM-DD H:MM AM/PM
  // Convert to 24h UTC
  const parts = fightTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (!parts) {
    await interaction.reply({ embeds: [createErrorEmbed('Invalid Time Format', 'Use: YYYY-MM-DD H:MM (e.g. 2026-06-29 6:30)')], ephemeral: true });
    return;
  }

  let hour = parseInt(parts[4], 10);
  const minute = parseInt(parts[5], 10);

  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const fightTime = new Date(Date.UTC(
    parseInt(parts[1], 10),
    parseInt(parts[2], 10) - 1,
    parseInt(parts[3], 10),
    hour,
    minute,
    0,
  ));

  if (isNaN(fightTime.getTime())) {
    await interaction.reply({ embeds: [createErrorEmbed('Invalid Time', 'Could not parse the date.')], ephemeral: true });
    return;
  }

  if (fightTime <= new Date()) {
    await interaction.reply({ embeds: [createErrorEmbed('Invalid Time', 'Fight time must be in the future.')], ephemeral: true });
    return;
  }

  const ticket = await Ticket.findOne({
    channelId: interaction.channelId,
    status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
  });

  if (!ticket) {
    await interaction.reply({ embeds: [createErrorEmbed('Not a Ticket', 'This can only be used in an active ticket channel.')], ephemeral: true });
    return;
  }

  if (ticket.claimedBy) {
    await interaction.reply({ embeds: [createErrorEmbed('Already Claimed', `This ticket has already been claimed by <@${ticket.claimedBy}>.`)], ephemeral: true });
    return;
  }

  // Save claim details
  ticket.claimedBy = interaction.user.id;
  ticket.fightTime = fightTime;
  ticket.fightType = fightType;
  ticket.fightAnnounced = false;
  ticket.fightOpened = false;
  await ticket.save();

  await interaction.deferReply();

  // Get player info for the announcement
  const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
  const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });

  if (!challenger || !opponent) {
    await interaction.editReply({ embeds: [createErrorEmbed('Error', 'Could not find player data.')] });
    return;
  }

  // Send announcement to the announce channel
  const announceChannel = await interaction.client.channels.fetch(ANNOUNCE_CHANNEL_ID).catch(() => null);
  if (announceChannel && announceChannel.isTextBased()) {
    const announceEmbed = new EmbedBuilder()
      .setTitle(fightType === 'auto' ? 'Auto Match' : 'Scheduled Match')
      .setColor(fightType === 'auto' ? 0x57F287 : 0x5865F2)
      .setDescription(
        `**${challenger.robloxUsername}** (${formatRank(challenger.rank)}) vs **${opponent.robloxUsername}** (${formatRank(opponent.rank)})\n\n` +
        `**Time:** ${discordTimestampFull(fightTime)}\n` +
        `**Type:** ${fightType === 'auto' ? 'Auto' : 'Normal'}\n` +
        `**Referee:** <@${interaction.user.id}>\n` +
        `**Ticket:** <#${ticket.channelId}>`,
      )
      .setTimestamp();

    await (announceChannel as any).send({
      content: `<@${ticket.challengerDiscordId}> <@${ticket.opponentDiscordId}> <@&${REFEREES_ROLE_ID}>`,
      embeds: [announceEmbed],
    });

    ticket.fightAnnounced = true;
    await ticket.save();
  }

  // Reply in the ticket channel
  await interaction.editReply({
    embeds: [createSuccessEmbed(
      'Ticket Claimed',
      `**Referee:** <@${interaction.user.id}>\n` +
      `**Fight Time:** ${discordTimestampFull(fightTime)}\n` +
      `**Type:** ${fightType === 'auto' ? 'Auto' : 'Normal'}\n\n` +
      `Announcement sent to <#${ANNOUNCE_CHANNEL_ID}>.\n` +
      `The fight will open automatically at the scheduled time.`,
    )],
  });

  await discordLog('Ticket Claimed', `**Referee:** <@${interaction.user.id}>\n**Challenger:** ${challenger.robloxUsername}\n**Opponent:** ${opponent.robloxUsername}\n**Fight Time:** ${discordTimestampFull(fightTime)}\n**Type:** ${fightType}`, 'info');

  logger.info(`Ticket ${ticket._id} claimed by ${interaction.user.id} — fight at ${fightTime} (${fightType})`);
}
