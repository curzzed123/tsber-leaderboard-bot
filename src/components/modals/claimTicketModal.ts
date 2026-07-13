import type { ModalSubmitInteraction } from 'discord.js';
import { Ticket } from '../../database/models/Ticket.js';
import { Player } from '../../database/models/Player.js';
import { TicketStatus, ModalInputCustomId } from '../../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embeds.js';
import { discordLog } from '../../utils/discordLogger.js';
import { logger } from '../../utils/logger.js';
import { formatRank } from '../../utils/formatting.js';

const REFEREES_ROLE_ID = '1520869356903600369';

export async function handleClaimTicketModal(interaction: ModalSubmitInteraction): Promise<void> {
  const fightType = interaction.fields.getTextInputValue(ModalInputCustomId.CLAIM_FIGHT_TYPE).trim().toLowerCase();
  let country = '';
  try {
    country = interaction.fields.getTextInputValue(ModalInputCustomId.CLAIM_COUNTRY)?.trim() || '';
  } catch { country = ''; }

  if (fightType !== 'auto' && fightType !== 'normal') {
    await interaction.reply({ content: 'Fight type must be "auto" or "normal".', ephemeral: true });
    return;
  }

  const ticket = await Ticket.findOne({
    channelId: interaction.channelId,
    status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
  });

  if (!ticket) {
    await interaction.reply({ content: 'This can only be used in an active ticket channel.', ephemeral: true });
    return;
  }

  if (ticket.claimedBy) {
    await interaction.reply({ content: `This ticket has already been claimed by <@${ticket.claimedBy}>.`, ephemeral: true });
    return;
  }

  ticket.claimedBy = interaction.user.id;
  ticket.fightType = fightType;
  await ticket.save();

  const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
  const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });

  if (!challenger || !opponent) {
    await interaction.reply({ content: 'Could not find player data.', ephemeral: true });
    return;
  }

  const chName = challenger.robloxUsername;
  const opName = opponent.robloxUsername;
  const chRank = challenger.rank ? `#${challenger.rank}` : 'Unranked';
  const opRank = opponent.rank ? `#${opponent.rank}` : 'Unranked';

  await interaction.reply({
    content:
      `**Ticket Claimed**\n` +
      `**Referee:** <@${interaction.user.id}>\n` +
      `**Type:** ${fightType === 'auto' ? 'Auto' : 'Normal'}\n` +
      (country ? `**Region:** ${country}\n` : '') +
      `\n${chName} (${chRank}) vs ${opName} (${opRank})\n\n` +
      `Check your DMs for the **Open Fight** button.`,
  });

  // DM the referee with the Open Fight button
  try {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const dmChannel = await interaction.user.createDM();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`open_fight:${ticket._id}`)
        .setLabel('Open Fight')
        .setStyle(ButtonStyle.Success),
    ) as any;

    if ('send' in dmChannel) {
      await (dmChannel as any).send({
        content:
          `**Open Fight**\n\n` +
          `**${chName}** (${chRank}) vs **${opName}** (${opRank})\n` +
          `**Type:** ${fightType === 'auto' ? 'Auto' : 'Normal'}\n\n` +
          `Click **Open Fight** when the match is about to start.`,
        components: [row],
      });
    }
  } catch (error) {
    logger.error('Failed to DM referee open fight button:', error);
  }

  await discordLog('Ticket Claimed', `**Referee:** <@${interaction.user.id}>\n**Challenger:** ${chName}\n**Opponent:** ${opName}\n**Type:** ${fightType}${country ? `\n**Region:** ${country}` : ''}`, 'info');
  logger.info(`Ticket ${ticket._id} claimed by ${interaction.user.id} (${fightType})`);
}
