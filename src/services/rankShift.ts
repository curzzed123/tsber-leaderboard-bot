import { Player } from '../database/models/Player.js';
import { Ticket } from '../database/models/Ticket.js';
import { getGuildDurations } from '../database/models/GuildConfig.js';
import { PlayerStatus, TicketStatus, type MatchOutcome } from '../types/index.js';
import { rankMutex } from '../utils/mutex.js';
import { logger } from '../utils/logger.js';
import type { IPlayer } from '../database/models/Player.js';
import type { ITicket } from '../database/models/Ticket.js';
import { refreshLeaderboard } from './leaderboard.js';
import { updatePlayerRoles } from './roles.js';

/**
 * Check if a player is in the Top 10 (rank 1-10).
 */
function isTop10(rank: number | null): boolean {
  return rank !== null && rank >= 1 && rank <= 10;
}

/**
 * Apply the "Smooth Moving" rank shift when a challenger wins.
 *
 * Before: ...11, 12(B), 13, 14, 15(A), 16...
 * After:  ...11, 12(A), 13(B), 14, 15, 16...
 *
 * - Everyone with rank in [targetRank, challengerRank - 1] shifts down (+1)
 * - Challenger takes the target's rank
 * - Loser (target) naturally drops 1 position
 */
async function applyChallengerWin(
  guildId: string,
  challengerDiscordId: string,
  opponentDiscordId: string,
): Promise<void> {
  const durations = await getGuildDurations(guildId);

  const challenger = await Player.findOne({ guildId, discordId: challengerDiscordId });
  const opponent = await Player.findOne({ guildId, discordId: opponentDiscordId });

  if (!challenger || !opponent) {
    throw new Error('Challenger or opponent not found');
  }
  if (challenger.rank === null || opponent.rank === null) {
    throw new Error('Both players must be ranked');
  }

  const challengerRank = challenger.rank;
  const opponentRank = opponent.rank;

  // Target must outrank challenger (lower rank number = better)
  if (opponentRank >= challengerRank) {
    throw new Error('Opponent must have a better (lower) rank than challenger');
  }

  logger.info(
    `Applying smooth move: challenger #${challengerRank} → #${opponentRank}, opponent was #${opponentRank}`,
  );

  // Shift everyone between opponentRank and challengerRank-1 down by 1
  await Player.updateMany(
    {
      guildId,
      rank: { $gte: opponentRank, $lte: challengerRank - 1 },
    },
    { $inc: { rank: 1 } },
  );

  // Challenger takes the opponent's rank
  challenger.rank = opponentRank;
  challenger.wins += 1;
  challenger.streak = challenger.streak >= 0 ? challenger.streak + 1 : 1;
  challenger.status = PlayerStatus.IDLE;
  challenger.cooldownUntil = null;
  challenger.immunityUntil = null;
  challenger.activeTicketId = null;

  // Loser (opponent) drops 1 position (already shifted by the updateMany above)
  opponent.losses += 1;
  opponent.streak = opponent.streak <= 0 ? opponent.streak - 1 : -1;
  opponent.status = PlayerStatus.IDLE;
  opponent.cooldownUntil = null;
  opponent.immunityUntil = null;
  opponent.activeTicketId = null;

  // Add per-opponent lockout: loser can't re-challenge the winner for 3 days
  const lockoutUntil = new Date(Date.now() + durations.lockoutMs);
  opponent.opponentLockouts.push({
    opponentDiscordId: challengerDiscordId,
    until: lockoutUntil,
  });

  // Prune expired lockouts
  const now = new Date();
  opponent.opponentLockouts = opponent.opponentLockouts.filter(
    (l) => new Date(l.until) > now,
  );

  await challenger.save();
  await opponent.save();

  logger.info(`Rank shift complete: challenger now #${challenger.rank}, opponent now #${opponent.rank}`);
}

/**
 * Apply the outcome when a challenger loses.
 * - No rank change
 * - Challenger gets cooldown (3d, or 1 week if Top 10)
 * - Opponent gets immunity (3d, or 1 week if Top 10)
 * - Per-opponent lockout: loser can't re-challenge winner for 3 days
 */
async function applyChallengerLoss(
  guildId: string,
  challengerDiscordId: string,
  opponentDiscordId: string,
): Promise<void> {
  const durations = await getGuildDurations(guildId);

  const challenger = await Player.findOne({ guildId, discordId: challengerDiscordId });
  const opponent = await Player.findOne({ guildId, discordId: opponentDiscordId });

  if (!challenger || !opponent) {
    throw new Error('Challenger or opponent not found');
  }

  const challengerTop10 = isTop10(challenger.rank);
  const opponentTop10 = isTop10(opponent.rank);

  // Challenger: cooldown
  challenger.losses += 1;
  challenger.streak = challenger.streak <= 0 ? challenger.streak - 1 : -1;
  challenger.status = PlayerStatus.COOLDOWN;
  challenger.cooldownUntil = new Date(
    Date.now() + (challengerTop10 ? durations.cooldownTop10Ms : durations.cooldownMs),
  );
  challenger.activeTicketId = null;

  // Opponent: immunity
  opponent.wins += 1;
  opponent.streak = opponent.streak >= 0 ? opponent.streak + 1 : 1;
  opponent.status = PlayerStatus.IMMUNE;
  opponent.immunityUntil = new Date(
    Date.now() + (opponentTop10 ? durations.immunityTop10Ms : durations.immunityMs),
  );
  opponent.activeTicketId = null;

  // Per-opponent lockout: loser (challenger) can't re-challenge the winner for 3 days
  const lockoutUntil = new Date(Date.now() + durations.lockoutMs);
  challenger.opponentLockouts.push({
    opponentDiscordId: opponentDiscordId,
    until: lockoutUntil,
  });

  // Prune expired lockouts
  const now = new Date();
  challenger.opponentLockouts = challenger.opponentLockouts.filter(
    (l) => new Date(l.until) > now,
  );

  await challenger.save();
  await opponent.save();

  logger.info(
    `Challenger loss applied: challenger on cooldown until ${challenger.cooldownUntil}, opponent immune until ${opponent.immunityUntil}`,
  );
}

/**
 * Resolve a match outcome. This is the single entry point used by:
 * - Referee ticket close
 * - /forcewin command
 * - Dodge timer auto-win
 *
 * All rank shifts are serialized via an async mutex.
 */
export async function resolveMatch(
  ticket: ITicket,
  outcome: MatchOutcome,
  closedBy: string,
): Promise<void> {
  await rankMutex.run(async () => {
    const { guildId, challengerDiscordId, opponentDiscordId } = ticket;

    if (outcome === 'WIN_CHALLENGER') {
      // Challenger wins: smooth move + take opponent's rank
      await applyChallengerWin(guildId, challengerDiscordId, opponentDiscordId);
      ticket.status = TicketStatus.CLOSED_WIN_CHALLENGER;
    } else if (outcome === 'WIN_OPPONENT') {
      // Challenger loses: cooldown + immunity, no rank change
      await applyChallengerLoss(guildId, challengerDiscordId, opponentDiscordId);
      ticket.status = TicketStatus.CLOSED_WIN_OPPONENT;
    } else {
      // Invalid: no rank change, no cooldown/immunity
      const challenger = await Player.findOne({ guildId, discordId: challengerDiscordId });
      const opponent = await Player.findOne({ guildId, discordId: opponentDiscordId });

      if (challenger) {
        challenger.status = PlayerStatus.IDLE;
        challenger.activeTicketId = null;
        await challenger.save();
      }
      if (opponent) {
        opponent.status = PlayerStatus.IDLE;
        opponent.activeTicketId = null;
        await opponent.save();
      }

      ticket.status = TicketStatus.CLOSED_INVALID;
    }

    ticket.outcome = outcome;
    ticket.closedAt = new Date();
    ticket.closedBy = closedBy;
    await ticket.save();

    // Refresh the leaderboard to reflect new ranks
    await refreshLeaderboard(ticket.guildId);

    // Update Discord roles for both players based on new ranks
    const client = (globalThis as any).client;
    if (client) {
      await updatePlayerRoles(client, challengerDiscordId, (await Player.findOne({ guildId, discordId: challengerDiscordId }))?.rank ?? null);
      await updatePlayerRoles(client, opponentDiscordId, (await Player.findOne({ guildId, discordId: opponentDiscordId }))?.rank ?? null);
    }

    logger.info(`Ticket ${ticket._id} resolved as ${outcome} by ${closedBy}`);
  });
}
