import { config } from '../config/index.js';
import { PlayerStatus, type MatchOutcome } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { ValidationResult } from '../types/index.js';
import { canChallengeRank, getValidTargetRanks } from '../config/rangeRules.js';
import type { IPlayer } from '../database/models/Player.js';
import { getGuildDurations } from '../database/models/GuildConfig.js';

/**
 * Check if a player's cooldown has expired.
 */
export function isCooldownExpired(player: IPlayer): boolean {
  if (player.status !== PlayerStatus.COOLDOWN) return true;
  if (!player.cooldownUntil) return true;
  return new Date() >= player.cooldownUntil;
}

/**
 * Check if a player's immunity has expired.
 */
export function isImmunityExpired(player: IPlayer): boolean {
  if (player.status !== PlayerStatus.IMMUNE) return true;
  if (!player.immunityUntil) return true;
  return new Date() >= player.immunityUntil;
}

/**
 * Check if a player is on an approved Leave of Absence.
 */
export function isOnLOA(player: IPlayer): boolean {
  if (!player.loa?.approved) return false;
  if (player.loa.until && new Date() >= player.loa.until) return false;
  return true;
}

/**
 * Check if a player is blocked from being challenged by a specific opponent lockout.
 */
export function hasOpponentLockout(player: IPlayer, opponentDiscordId: string): boolean {
  const now = new Date();
  return player.opponentLockouts.some(
    (lockout) =>
      lockout.opponentDiscordId === opponentDiscordId &&
      new Date(lockout.until) > now,
  );
}

/**
 * Validate whether a challenger can challenge a target.
 * Returns { valid: boolean, reason?: string }.
 */
export async function validateChallenge(
  challenger: IPlayer,
  target: IPlayer,
): Promise<ValidationResult> {
  // 1. Both players must exist and be in the same guild
  if (challenger.guildId !== target.guildId) {
    return { valid: false, reason: 'Players are not in the same guild.' };
  }

  // 2. Challenger must be ranked (not Stage 0/Unranked)
  if (challenger.rank === null) {
    // Unranked players can only challenge the lowest-ranked player
    return { valid: false, reason: 'Unranked players must be assigned a rank first. Use `/setrank`.' };
  }

  // 3. Target must be ranked
  if (target.rank === null) {
    return { valid: false, reason: 'Target opponent is unranked.' };
  }

  // 4. Can't challenge yourself
  if (challenger.discordId === target.discordId) {
    return { valid: false, reason: 'You cannot challenge yourself.' };
  }

  // 5. Challenger status must be IDLE
  if (challenger.status !== PlayerStatus.IDLE) {
    const statusReasons: Record<string, string> = {
      [PlayerStatus.CHALLENGING]: 'You are already challenging someone.',
      [PlayerStatus.CHALLENGED]: 'You are currently being challenged.',
      [PlayerStatus.IMMUNE]: 'You have immunity and cannot challenge right now.',
      [PlayerStatus.COOLDOWN]: 'You are on cooldown and cannot challenge right now.',
    };
    return { valid: false, reason: statusReasons[challenger.status] ?? 'You are not available to challenge.' };
  }

  // 6. Check challenger cooldown
  if (!isCooldownExpired(challenger)) {
    return { valid: false, reason: `You are on cooldown until <t:${Math.floor((challenger.cooldownUntil?.getTime() ?? 0) / 1000)}:R>.` };
  }

  // 7. Target status check
  if (target.status !== PlayerStatus.IDLE) {
    const statusReasons: Record<string, string> = {
      [PlayerStatus.CHALLENGING]: 'Target opponent is currently challenging someone.',
      [PlayerStatus.CHALLENGED]: 'Target opponent is already being challenged.',
      [PlayerStatus.IMMUNE]: 'Target opponent has immunity.',
      [PlayerStatus.COOLDOWN]: 'Target opponent is on cooldown.',
    };
    return { valid: false, reason: statusReasons[target.status] ?? 'Target opponent is not available.' };
  }

  // 8. Check target immunity
  if (!isImmunityExpired(target)) {
    return { valid: false, reason: 'Target opponent has immunity.' };
  }

  // 9. Check if target is on LOA
  if (isOnLOA(target)) {
    return { valid: false, reason: 'Target opponent is on an approved Leave of Absence.' };
  }

  // 10. Check per-opponent lockout (loser can't re-challenge the same person for 3 days)
  if (hasOpponentLockout(challenger, target.discordId)) {
    const lockout = challenger.opponentLockouts.find(
      (l) => l.opponentDiscordId === target.discordId && new Date(l.until) > new Date(),
    );
    return { valid: false, reason: `You cannot re-challenge this opponent until <t:${Math.floor(new Date(lockout!.until).getTime() / 1000)}:R>.` };
  }

  // 11. Range validation
  if (!canChallengeRank(challenger.rank, target.rank)) {
    const validRanks = getValidTargetRanks(challenger.rank);
    if (validRanks.length === 0) {
      return { valid: false, reason: 'No valid challenge targets available for your rank.' };
    }
    return {
      valid: false,
      reason: `You can only challenge ranks: ${validRanks.map((r) => `#${r}`).join(', ')}.`,
    };
  }

  return { valid: true };
}

/**
 * Get all eligible opponents for a challenger.
 * Returns a list of players that the challenger can challenge.
 */
export async function getEligibleOpponents(
  challenger: IPlayer,
  allPlayers: IPlayer[],
): Promise<IPlayer[]> {
  if (challenger.rank === null) return [];

  const validTargetRanks = getValidTargetRanks(challenger.rank);
  if (validTargetRanks.length === 0) return [];

  const eligible: IPlayer[] = [];

  for (const player of allPlayers) {
    if (player.discordId === challenger.discordId) continue;
    if (player.rank === null) continue;
    if (!validTargetRanks.includes(player.rank)) continue;

    // Quick status checks for the opponent select menu
    if (player.status !== PlayerStatus.IDLE) continue;
    if (!isImmunityExpired(player)) continue;
    if (isOnLOA(player)) continue;
    if (hasOpponentLockout(challenger, player.discordId)) continue;

    eligible.push(player);
  }

  return eligible;
}
