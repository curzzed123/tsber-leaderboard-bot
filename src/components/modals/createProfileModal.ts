import type { ModalSubmitInteraction } from 'discord.js';
import { Player } from '../../database/models/Player.js';
import { Region, PlayerStatus, ModalInputCustomId } from '../../types/index.js';
import { verifyUser, fetchRobloxHeadshot } from '../../services/rover.js';
import { createSuccessEmbed, createErrorEmbed } from '../../utils/embeds.js';
import { refreshLeaderboard } from '../../services/leaderboard.js';
import { logger } from '../../utils/logger.js';

export async function handleCreateProfileModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ embeds: [createErrorEmbed('Error', 'This can only be used in a server.')], ephemeral: true });
    return;
  }

  const robloxUsername = interaction.fields.getTextInputValue(ModalInputCustomId.ROBLOX_USERNAME).trim();
  const regionInput = interaction.fields.getTextInputValue(ModalInputCustomId.REGION).trim().toUpperCase();

  // Validate region
  const validRegions = Object.values(Region);
  if (!validRegions.includes(regionInput as Region)) {
    await interaction.reply({
      embeds: [createErrorEmbed('Invalid Region', `Region must be one of: ${validRegions.join(', ')}`)],
      ephemeral: true,
    });
    return;
  }

  // Check if player already exists
  const existing = await Player.findOne({
    guildId: interaction.guildId,
    discordId: interaction.user.id,
  });

  if (existing) {
    await interaction.reply({
      embeds: [createErrorEmbed('Already Registered', `You are already registered as **${existing.robloxUsername}**. Contact staff if you need to update your profile.`)],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Verify with Rover API
  const roverData = await verifyUser(interaction.user.id);

  if (!roverData) {
    await interaction.editReply({
      embeds: [createErrorEmbed(
        'Verification Failed',
        'Could not verify your Roblox account via Rover. Please ensure you have verified your Discord account at **https://rover.link** and try again.',
      )],
    });
    return;
  }

  // Verify the Roblox username matches
  if (roverData.robloxUsername.toLowerCase() !== robloxUsername.toLowerCase()) {
    await interaction.editReply({
      embeds: [createErrorEmbed(
        'Username Mismatch',
        `The Roblox username you entered (**${robloxUsername}**) does not match the one linked to your Discord via Rover (**${roverData.robloxUsername}**). Please use your verified Roblox username.`,
      )],
    });
    return;
  }

  // Fetch headshot
  const { url: headshotUrl, expiresAt: headshotExpiresAt } = await fetchRobloxHeadshot(roverData.robloxId);

  // Create the player profile
  const player = await Player.create({
    guildId: interaction.guildId,
    discordId: interaction.user.id,
    robloxId: roverData.robloxId,
    robloxUsername: roverData.robloxUsername,
    robloxHeadshotUrl: headshotUrl,
    robloxHeadshotExpiresAt: headshotExpiresAt,
    rank: null,
    stage: 'Stage 0',
    region: regionInput as Region,
    wins: 0,
    losses: 0,
    streak: 0,
    status: PlayerStatus.IDLE,
    cooldownUntil: null,
    immunityUntil: null,
    activeTicketId: null,
    opponentLockouts: [],
    loa: { approved: false, until: null, reason: '' },
  });

  await refreshLeaderboard(interaction.guildId);

  const embed = createSuccessEmbed(
    'Profile Created',
    `Welcome to the leaderboard, **${player.robloxUsername}**!\n\n` +
    `**Region:** ${player.region}\n` +
    `**Status:** Stage 0 (Unranked)\n\n` +
    `Ask a staff member to assign you a rank using \`/setrank\` to start challenging.`,
  );

  if (headshotUrl) {
    embed.setThumbnail(headshotUrl);
  }

  await interaction.editReply({ embeds: [embed] });
  logger.info(`Profile created for ${interaction.user.id} — Roblox: ${roverData.robloxUsername}`);
}
