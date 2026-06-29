import type { ButtonInteraction } from 'discord.js';
import { Player } from '../../database/models/Player.js';
import { PlayerStatus } from '../../types/index.js';
import { createErrorEmbed } from '../../utils/embeds.js';
import { formatRank } from '../../utils/formatting.js';
import { getEligibleOpponents } from '../../services/challengeValidation.js';
import { discordLog } from '../../utils/discordLogger.js';
import { StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { SelectCustomId } from '../../types/index.js';
import type { IPlayer } from '../../database/models/Player.js';

export async function handleChallengeButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ embeds: [createErrorEmbed('Error', 'This can only be used in a server.')], ephemeral: true });
    return;
  }

  // Find the challenger's profile
  const challenger = await Player.findOne({
    guildId: interaction.guildId,
    discordId: interaction.user.id,
  });

  if (!challenger) {
    await interaction.reply({
      embeds: [createErrorEmbed('Profile Not Found', 'You must create a profile first. Click the **[Create]** button to register.')],
      ephemeral: true,
    });
    return;
  }

  // Check if player is ranked
  if (challenger.rank === null) {
    await interaction.reply({
      embeds: [createErrorEmbed('Unranked', 'You must be assigned a rank before challenging. Ask staff to use `/setrank`.')],
      ephemeral: true,
    });
    return;
  }

  // Check if player is available to challenge
  if (challenger.status !== PlayerStatus.IDLE) {
    const statusMessages: Record<string, string> = {
      [PlayerStatus.CHALLENGING]: 'You are already challenging someone.',
      [PlayerStatus.CHALLENGED]: 'You are currently being challenged.',
      [PlayerStatus.IMMUNE]: 'You have immunity and cannot challenge right now.',
      [PlayerStatus.COOLDOWN]: 'You are on cooldown and cannot challenge right now.',
    };
    await interaction.reply({
      embeds: [createErrorEmbed('Unavailable', statusMessages[challenger.status] ?? 'You are not available to challenge.')],
      ephemeral: true,
    });
    return;
  }

  // Get all ranked players in the guild
  const allPlayers = await Player.find({
    guildId: interaction.guildId,
    rank: { $ne: null },
  }).sort({ rank: 1 });

  // Get eligible opponents
  const eligibleOpponents = await getEligibleOpponents(challenger, allPlayers);

  if (eligibleOpponents.length === 0) {
    await interaction.reply({
      embeds: [createErrorEmbed('No Eligible Opponents', `No opponents are available for you to challenge at rank ${formatRank(challenger.rank)}. Check the leaderboard for available targets.`)],
      ephemeral: true,
    });
    return;
  }

  // Build the select menu
  const options = eligibleOpponents.slice(0, 25).map((opponent: IPlayer) => ({
    label: `#${opponent.rank} — ${opponent.robloxUsername}`,
    description: `${opponent.wins}W / ${opponent.losses}L | ${opponent.region}`,
    value: opponent.discordId,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(SelectCustomId.CHALLENGE_OPPONENT)
    .setPlaceholder('Select an opponent to challenge')
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await interaction.reply({
    content: `**Select your opponent** — You are currently ${formatRank(challenger.rank)} (${challenger.wins}W / ${challenger.losses}L)`,
    components: [row],
    ephemeral: true,
  });
}
