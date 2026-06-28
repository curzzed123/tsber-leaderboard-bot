import type { Client } from 'discord.js';
import { Ticket } from '../database/models/Ticket.js';
import { Player } from '../database/models/Player.js';
import { getGuildDurations } from '../database/models/GuildConfig.js';
import { PlayerStatus, TicketStatus, type MatchOutcome } from '../types/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { resolveMatch } from './rankShift.js';
import { closeTicket } from './ticketFlow.js';
import { refreshLeaderboard } from './leaderboard.js';
import type { ITicket } from '../database/models/Ticket.js';

let schedulerInterval: NodeJS.Timeout | null = null;
let clientRef: Client | null = null;

/**
 * Run a single sweep of all timer-based checks.
 * Called every 60 seconds by the scheduler.
 */
async function sweep(): Promise<void> {
  if (!clientRef) return;

  const now = new Date();

  // 1. Dodge timer: OPEN tickets where opponent hasn't responded and deadline passed
  const dodgeTickets = await Ticket.find({
    status: TicketStatus.OPEN,
    opponentResponded: false,
    dodgeDeadline: { $lte: now },
  });

  for (const ticket of dodgeTickets) {
    logger.info(`Dodge timer expired for ticket ${ticket._id} — auto-win to challenger`);
    try {
      await closeTicket(clientRef, ticket, 'WIN_CHALLENGER', 'SYSTEM');
    } catch (error) {
      logger.error(`Failed to process dodge auto-win for ticket ${ticket._id}:`, error);
    }
  }

  // 2. Inactivity timer: OPEN tickets with no activity for 3 days
  const inactiveTickets = await Ticket.find({
    status: TicketStatus.OPEN,
    inactivityDeadline: { $lte: now },
  });

  for (const ticket of inactiveTickets) {
    logger.info(`Inactivity timer expired for ticket ${ticket._id} — closing as invalid`);
    try {
      await closeTicket(clientRef, ticket, 'INVALID', 'SYSTEM');
    } catch (error) {
      logger.error(`Failed to process inactivity close for ticket ${ticket._id}:`, error);
    }
  }

  // 3. Cooldown expiry: players whose cooldown has passed
  const cooldownExpired = await Player.find({
    status: PlayerStatus.COOLDOWN,
    cooldownUntil: { $lte: now },
  });

  for (const player of cooldownExpired) {
    player.status = PlayerStatus.IDLE;
    player.cooldownUntil = null;
    await player.save();
    logger.debug(`Cooldown expired for player ${player.robloxUsername}`);
  }

  // 4. Immunity expiry: players whose immunity has passed
  const immunityExpired = await Player.find({
    status: PlayerStatus.IMMUNE,
    immunityUntil: { $lte: now },
  });

  for (const player of immunityExpired) {
    player.status = PlayerStatus.IDLE;
    player.immunityUntil = null;
    await player.save();
    logger.debug(`Immunity expired for player ${player.robloxUsername}`);
  }

  // 5. LOA expiry: clear approved LOA that has passed
  const loaExpired = await Player.find({
    'loa.approved': true,
    'loa.until': { $lte: now, $ne: null },
  });

  for (const player of loaExpired) {
    player.loa.approved = false;
    player.loa.until = null;
    player.loa.reason = '';
    await player.save();
    logger.debug(`LOA expired for player ${player.robloxUsername}`);
  }

  // 6. Prune expired opponent lockouts
  const playersWithLockouts = await Player.find({
    opponentLockouts: { $elemMatch: { until: { $lte: now } } },
  });

  for (const player of playersWithLockouts) {
    player.opponentLockouts = player.opponentLockouts.filter(
      (l) => new Date(l.until) > now,
    );
    await player.save();
  }

  // 7. Refresh leaderboard for all guilds with changes
  if (
    dodgeTickets.length > 0 ||
    inactiveTickets.length > 0 ||
    cooldownExpired.length > 0 ||
    immunityExpired.length > 0 ||
    loaExpired.length > 0
  ) {
    const guildIds = new Set<string>();
    for (const t of [...dodgeTickets, ...inactiveTickets]) guildIds.add(t.guildId);
    for (const p of [...cooldownExpired, ...immunityExpired, ...loaExpired]) guildIds.add(p.guildId);

    for (const guildId of guildIds) {
      await refreshLeaderboard(guildId);
    }
  }
}

/**
 * Start the periodic scheduler.
 * Runs every 60 seconds to check all timer-based conditions.
 */
export function startScheduler(client: Client): void {
  clientRef = client;

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Run immediately, then every intervalMs
  sweep().catch((error) => logger.error('Scheduler sweep error:', error));

  schedulerInterval = setInterval(() => {
    sweep().catch((error) => logger.error('Scheduler sweep error:', error));
  }, config.scheduler.intervalMs);

  logger.info(`Scheduler started (interval: ${config.scheduler.intervalMs / 1000}s)`);
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}
