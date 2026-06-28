import { Player } from '../database/models/Player.js';
import { Ticket } from '../database/models/Ticket.js';
import { PlayerStatus, TicketStatus } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { refreshLeaderboard } from './leaderboard.js';

/**
 * Reconcile stuck player statuses on bot startup.
 *
 * If a crash occurs mid-challenge, players may be left in CHALLENGING or
 * CHALLENGED status with no matching open ticket. This function finds
 * those players and resets them to IDLE (respecting cooldowns/immunity).
 */
export async function reconcileStuckPlayers(): Promise<void> {
  const now = new Date();

  // Find players in CHALLENGING or CHALLENGED status
  const stuckPlayers = await Player.find({
    status: { $in: [PlayerStatus.CHALLENGING, PlayerStatus.CHALLENGED] },
  });

  let resetCount = 0;

  for (const player of stuckPlayers) {
    // Check if there's an open or frozen ticket for this player
    const openTicket = await Ticket.findOne({
      $or: [
        { challengerDiscordId: player.discordId },
        { opponentDiscordId: player.discordId },
      ],
      status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
    });

    if (!openTicket) {
      // No open ticket — reset to IDLE
      logger.warn(
        `Reconciling stuck player ${player.robloxUsername} (was ${player.status}) — no open ticket found`,
      );

      player.status = PlayerStatus.IDLE;
      player.activeTicketId = null;

      // Check if cooldown should be active
      if (player.cooldownUntil && new Date(player.cooldownUntil) > now) {
        player.status = PlayerStatus.COOLDOWN;
      }
      // Check if immunity should be active
      else if (player.immunityUntil && new Date(player.immunityUntil) > now) {
        player.status = PlayerStatus.IMMUNE;
      }

      await player.save();
      resetCount++;
    }
  }

  // Also close any orphaned tickets (OPEN but both players are IDLE)
  const openTickets = await Ticket.find({
    status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
  });

  let closedTickets = 0;

  for (const ticket of openTickets) {
    const challenger = await Player.findOne({
      guildId: ticket.guildId,
      discordId: ticket.challengerDiscordId,
    });
    const opponent = await Player.findOne({
      guildId: ticket.guildId,
      discordId: ticket.opponentDiscordId,
    });

    if (!challenger || !opponent) {
      // Player deleted — close ticket as invalid
      ticket.status = TicketStatus.CLOSED_INVALID;
      ticket.closedAt = now;
      ticket.closedBy = 'SYSTEM';
      ticket.reason = 'Player not found during reconciliation';
      await ticket.save();
      closedTickets++;
      continue;
    }

    // If both players are IDLE (not in challenge status), the ticket is stale
    if (
      challenger.status === PlayerStatus.IDLE &&
      opponent.status === PlayerStatus.IDLE
    ) {
      ticket.status = TicketStatus.CLOSED_INVALID;
      ticket.closedAt = now;
      ticket.closedBy = 'SYSTEM';
      ticket.reason = 'Stale ticket — both players IDLE during reconciliation';
      await ticket.save();
      closedTickets++;
    }
  }

  if (resetCount > 0 || closedTickets > 0) {
    logger.info(`Reconciliation complete: ${resetCount} players reset, ${closedTickets} tickets closed`);

    // Refresh leaderboards for affected guilds
    const affectedGuilds = new Set<string>();
    for (const player of stuckPlayers) affectedGuilds.add(player.guildId);
    for (const ticket of openTickets) affectedGuilds.add(ticket.guildId);

    for (const guildId of affectedGuilds) {
      await refreshLeaderboard(guildId);
    }
  } else {
    logger.info('Reconciliation complete: no stuck players or stale tickets found');
  }
}
