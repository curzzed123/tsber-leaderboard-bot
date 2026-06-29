import type { ModalSubmitInteraction } from 'discord.js';
import { Player } from '../../database/models/Player.js';
import { Region, PlayerStatus, ModalInputCustomId } from '../../types/index.js';
import { findRobloxUser, fetchRobloxHeadshot } from '../../services/rover.js';
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

  // Search Roblox directly by username — no Rover needed
  const robloxData = await findRobloxUser(robloxUsername);

  if (!robloxData) {
    await interaction.editReply({
      embeds: [createErrorEmbed(
        'User Not Found',
        `No Roblox account found with the username **${robloxUsername}**. Check the spelling and try again.`,
      )],
    });
    return;
  }

  // Fetch Roblox headshot automatically
  const { url: headshotUrl, expiresAt: headshotExpiresAt } = await fetchRobloxHeadshot(robloxData.robloxId);

  // Get optional custom headshot URL
  let customHeadshotUrl: string | null = null;
  try {
    customHeadshotUrl = interaction.fields.getTextInputValue(ModalInputCustomId.CUSTOM_HEADSHOT_URL)?.trim() || null;
  } catch {
    customHeadshotUrl = null;
  }

  const finalHeadshotUrl = customHeadshotUrl || headshotUrl;
  const finalExpiresAt = customHeadshotUrl
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : headshotExpiresAt;

  // Create the player profile
  const player = await Player.create({
    guildId: interaction.guildId,
    discordId: interaction.user.id,
    robloxId: robloxData.robloxId,
    robloxUsername: robloxData.robloxUsername,
    robloxHeadshotUrl: finalHeadshotUrl,
    robloxHeadshotExpiresAt: finalExpiresAt,
    customHeadshotUrl,
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

  // Refresh leaderboard immediately — edits existing message
  await refreshLeaderboard(interaction.guildId);

  const embed = createSuccessEmbed(
    'Profile Created',
    `Welcome to the leaderboard, **${player.robloxUsername}**!\n\n` +
    `**Region:** ${player.region}\n` +
    `**Status:** Stage 0 (Unranked)\n\n` +
    `Ask a staff member to assign you a rank using \`/setrank\` to start challenging.`,
  );

  if (finalHeadshotUrl) {
    embed.setThumbnail(finalHeadshotUrl);
  }

  await interaction.editReply({ embeds: [embed] });
  logger.info(`Profile created for ${interaction.user.id} — Roblox: ${robloxData.robloxUsername} (ID: ${robloxData.robloxId})`);
}
