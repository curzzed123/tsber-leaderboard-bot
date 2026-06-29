import type { ButtonInteraction } from 'discord.js';
import { Player } from '../../database/models/Player.js';
import { PlayerStatus } from '../../types/index.js';
import { createErrorEmbed } from '../../utils/embeds.js';
import { formatRank } from '../../utils/formatting.js';
import { getEligibleOpponents, isAvailable } from '../../services/challengeValidation.js';
import { StringSelectMenuBuilder, ActionRowBuilder } from 'discord.js';
import { SelectCustomId } from '../../types/index.js';
import type { IPlayer } from '../../database/models/Player.js';
import { logger } from '../../utils/logger.js';

export async function handleChallengeButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ embeds: [createErrorEmbed('Error', 'This can only be used in a server.')], ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const challenger = await Player.findOne({
    guildId: interaction.guildId,
    discordId: interaction.user.id,
  });

  if (!challenger) {
    await interaction.editReply({ embeds: [createErrorEmbed('Profile Not Found', 'You must create a profile first.')] });
    return;
  }

  if (challenger.rank === null) {
    await interaction.editReply({ embeds: [createErrorEmbed('Unranked', 'You must be assigned a rank before challenging. Ask staff to use /setrank.')] });
    return;
  }

  // Fix stale cooldown/immunity status
  if (challenger.status === PlayerStatus.COOLDOWN && challenger.cooldownUntil && new Date() >= challenger.cooldownUntil) {
    challenger.status = PlayerStatus.IDLE;
    challenger.cooldownUntil = null;
    await challenger.save();
    logger.info(`Fixed stale cooldown for ${challenger.robloxUsername}`);
  }
  if (challenger.status === PlayerStatus.IMMUNE && challenger.immunityUntil && new Date() >= challenger.immunityUntil) {
    challenger.status = PlayerStatus.IDLE;
    challenger.immunityUntil = null;
    await challenger.save();
    logger.info(`Fixed stale immunity for ${challenger.robloxUsername}`);
  }

  // Only Challengeable players can challenge
  if (!isAvailable(challenger)) {
    const statusMessages: Record<string, string> = {
      [PlayerStatus.CHALLENGING]: 'You are already challenging someone.',
      [PlayerStatus.CHALLENGED]: 'You are currently being challenged.',
      [PlayerStatus.IMMUNE]: 'You have immunity and cannot challenge right now.',
      [PlayerStatus.COOLDOWN]: 'You are on cooldown and cannot challenge right now.',
    };
    await interaction.editReply({ embeds: [createErrorEmbed('Not Challengeable', statusMessages[challenger.status] ?? 'You are not available to challenge.')] });
    return;
  }

  const allPlayers = await Player.find({
    guildId: interaction.guildId,
    rank: { $ne: null },
  }).sort({ rank: 1 });

  const eligibleOpponents = await getEligibleOpponents(challenger, allPlayers);

  if (eligibleOpponents.length === 0) {
    await interaction.editReply({ embeds: [createErrorEmbed('No Eligible Opponents', `No Challengeable opponents available for rank ${formatRank(challenger.rank)}.`)] });
    return;
  }

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

  await interaction.editReply({
    content: `**Select your opponent** — You are ${formatRank(challenger.rank)} (${challenger.wins}W / ${challenger.losses}L)`,
    components: [row],
  });
}
