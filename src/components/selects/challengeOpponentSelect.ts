import type { StringSelectMenuInteraction } from 'discord.js';
import { Player } from '../../database/models/Player.js';
import { validateChallenge } from '../../services/challengeValidation.js';
import { createTicket } from '../../services/ticketFlow.js';
import { createErrorEmbed, createSuccessEmbed } from '../../utils/embeds.js';
import { formatRank } from '../../utils/formatting.js';
import { discordLog } from '../../utils/discordLogger.js';
import { logger } from '../../utils/logger.js';

export async function handleChallengeOpponentSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ embeds: [createErrorEmbed('Error', 'This can only be used in a server.')], ephemeral: true });
    return;
  }

  const opponentDiscordId = interaction.values[0];

  // Fetch both players
  const challenger = await Player.findOne({
    guildId: interaction.guildId,
    discordId: interaction.user.id,
  });

  if (!challenger) {
    await interaction.update({ content: 'Profile not found. Please create a profile first.', components: [] });
    return;
  }

  const opponent = await Player.findOne({
    guildId: interaction.guildId,
    discordId: opponentDiscordId,
  });

  if (!opponent) {
    await interaction.update({ content: 'Opponent not found.', components: [] });
    return;
  }

  // Validate the challenge
  const validation = await validateChallenge(challenger, opponent);

  if (!validation.valid) {
    await interaction.update({
      embeds: [createErrorEmbed('Challenge Blocked', validation.reason ?? 'You cannot challenge this opponent.')],
      components: [],
    });
    return;
  }

  // Create the ticket
  await interaction.deferUpdate();

  try {
    const ticket = await createTicket(interaction.client, interaction.guildId, challenger, opponent);

    if (!ticket) {
      await interaction.editReply({
        embeds: [createErrorEmbed('Error', 'Failed to create ticket channel. Please try again or contact staff.')],
        components: [],
      });
      return;
    }

    // Get the ticket channel to send a link
    const channel = await interaction.client.channels.fetch(ticket.channelId);

    await interaction.editReply({
      embeds: [createSuccessEmbed(
        'Challenge Issued!',
        `You have challenged **${opponent.robloxUsername}** (${formatRank(opponent.rank)}).\n\nTicket channel: ${channel ? `<#${channel.id}>` : 'Created'}`,
      )],
      components: [],
    });

    logger.info(`Challenge issued: ${challenger.robloxUsername} → ${opponent.robloxUsername}`);
    await discordLog('Challenge Issued', `**Challenger:** ${challenger.robloxUsername} (${formatRank(challenger.rank)})\n**Opponent:** ${opponent.robloxUsername} (${formatRank(opponent.rank)})\n**Discord:** <@${challenger.discordId}> → <@${opponent.discordId}>`, 'info');
  } catch (error) {
    logger.error('Error creating ticket:', error);
    await interaction.editReply({
      embeds: [createErrorEmbed('Error', 'Failed to create ticket. Please try again or contact staff.')],
      components: [],
    });
  }
}
