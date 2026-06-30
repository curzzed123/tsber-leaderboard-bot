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
import { discordLog } from '../utils/discordLogger.js';
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
      await discordLog('Dodge Auto-Win', `**Ticket:** ${ticket._id}\n**Challenger:** <@${ticket.challengerDiscordId}>\n**Opponent:** <@${ticket.opponentDiscordId}>\nOpponent didn't respond in 48h. Auto-win awarded.`, 'warn');
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
      await discordLog('Inactivity Close', `**Ticket:** ${ticket._id}\n**Challenger:** <@${ticket.challengerDiscordId}>\n**Opponent:** <@${ticket.opponentDiscordId}>\nNo activity for 3 days. Ticket closed as invalid.`, 'warn');
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
    await discordLog('Cooldown Expired', `**Player:** ${player.robloxUsername}\nStatus returned to Challengeable.`, 'info');
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
    await discordLog('Immunity Expired', `**Player:** ${player.robloxUsername}\nStatus returned to Challengeable.`, 'info');
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

  // 6.5 Send 2-hour reminder DMs to both players before fight time
  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const remindersToSend = await Ticket.find({
    status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
    fightTime: { $lte: twoHoursFromNow, $gt: now },
    reminderSent: false,
    claimedBy: { $ne: null },
  });

  for (const ticket of remindersToSend) {
    try {
      if (!clientRef) continue;

      const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
      const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });

      const chName = challenger?.robloxUsername ?? 'Challenger';
      const opName = opponent?.robloxUsername ?? 'Opponent';

      const reminderText =
        `**Fight Reminder — 2 Hours Left**\n\n` +
        `Your fight is in **2 hours**.\n\n` +
        `**Match:** ${chName} vs ${opName}\n` +
        `**Fight Time:** <t:${Math.floor(new Date(ticket.fightTime!).getTime() / 1000)}:F>\n` +
        `**Time until fight:** <t:${Math.floor(new Date(ticket.fightTime!).getTime() / 1000)}:R>\n` +
        `**Type:** ${ticket.fightType === 'auto' ? 'Auto' : 'Normal'}\n\n` +
        `Be ready and available at the scheduled time.`;

      // DM challenger
      try {
        const chUser = await clientRef.users.fetch(ticket.challengerDiscordId);
        const chDM = await chUser.createDM();
        if ('send' in chDM) await (chDM as any).send({ content: reminderText });
      } catch {}

      // DM opponent
      try {
        const opUser = await clientRef.users.fetch(ticket.opponentDiscordId);
        const opDM = await opUser.createDM();
        if ('send' in opDM) await (opDM as any).send({ content: reminderText });
      } catch {}

      ticket.reminderSent = true;
      await ticket.save();

      logger.info(`2-hour reminder sent for ticket ${ticket._id} — ${chName} vs ${opName}`);
      await discordLog('Fight Reminder Sent', `**Match:** ${chName} vs ${opName}\n**Fight Time:** <t:${Math.floor(new Date(ticket.fightTime!).getTime() / 1000)}:F>\nBoth players have been DM'd.`, 'info');
    } catch (error) {
      logger.error(`Failed to send reminder for ticket ${ticket._id}:`, error);
    }
  }

  // 7. Auto-open scheduled fights — when fightTime has arrived
  const fightsToOpen = await Ticket.find({
    status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] },
    fightTime: { $lte: now },
    fightOpened: false,
    claimedBy: { $ne: null },
  });

  for (const ticket of fightsToOpen) {
    try {
      if (!clientRef) continue;

      const challenger = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.challengerDiscordId });
      const opponent = await Player.findOne({ guildId: ticket.guildId, discordId: ticket.opponentDiscordId });

      const chName = challenger?.robloxUsername ?? 'Challenger';
      const opName = opponent?.robloxUsername ?? 'Opponent';
      const chRank = challenger?.rank ? `#${challenger.rank}` : 'Unranked';
      const opRank = opponent?.rank ? `#${opponent.rank}` : 'Unranked';

      const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = await import('discord.js');

      let channel;

      if (ticket.firstChannelClosed && !ticket.fightChannelId) {
        // First channel was deleted — create a NEW channel for the fight
        const guild = clientRef.guilds.cache.get(ticket.guildId);
        if (!guild) continue;

        const sanitize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        const channelName = `fight-${sanitize(chName)}-vs-${sanitize(opName)}`;

        const overwrites: any[] = [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: ticket.challengerDiscordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: ticket.opponentDiscordId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: '1520869356903600369', allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
          { id: clientRef.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        ];

        channel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: '1521267547150749879',
          permissionOverwrites: overwrites,
          topic: `Fight: ${chName} vs ${opName} — ${ticket.fightType}`,
        });

        ticket.fightChannelId = channel.id;
        await ticket.save();
        logger.info(`Fight channel created for ticket ${ticket._id}: ${channel.id}`);
      } else if (ticket.fightChannelId) {
        // Fight channel already exists
        channel = await clientRef.channels.fetch(ticket.fightChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) continue;
      } else {
        // First channel still exists
        channel = await clientRef.channels.fetch(ticket.channelId);
        if (!channel || !channel.isTextBased()) continue;
      }

      const fightText =
        `**Fight Starting Now**\n` +
        `**${chName}** (${chRank}) vs **${opName}** (${opRank})\n\n` +
        `The scheduled fight time has arrived.\n` +
        `**Type:** ${ticket.fightType === 'auto' ? 'Auto' : 'Normal'}\n` +
        `**Referee:** <@${ticket.claimedBy}>`;

      // Add Close button so referee can close after fight
      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger),
      ) as any;

      await (channel as any).send({
        content: `<@${ticket.challengerDiscordId}> <@${ticket.opponentDiscordId}> <@&${'1520869356903600369'}> The fight is starting now!\n\n${fightText}`,
        components: [closeButton],
      });

      ticket.fightOpened = true;
      await ticket.save();

      // DM the referee asking for the winner — plain text
      if (ticket.claimedBy) {
        try {
          const referee = await clientRef.users.fetch(ticket.claimedBy);
          const dmChannel = await referee.createDM();

          if (ticket.fightType === 'auto') {
            // Auto fight — simpler DM, no score needed
            const dmText =
              `**Select Auto Match Winner**\n\n` +
              `**${chName}** (${chRank}) vs **${opName}** (${opRank})\n\n` +
              `The fight time has arrived. Select the winner below.\n` +
              `Winner gets the spot +1 win. Score will be announced as Auto Win.`;

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`dm_win_challenger:${ticket._id}:auto`).setLabel(`${chName} Wins`).setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`dm_win_opponent:${ticket._id}:auto`).setLabel(`${opName} Wins`).setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`dm_invalid:${ticket._id}:auto`).setLabel('Invalid').setStyle(ButtonStyle.Danger),
            ) as any;

            if ('send' in dmChannel) {
              await (dmChannel as any).send({ content: dmText, components: [row] });
              logger.info(`Auto winner DM sent to referee ${ticket.claimedBy} for ticket ${ticket._id}`);
            }
          } else {
            // Normal fight — needs score
            const dmText =
              `**Select Match Winner**\n\n` +
              `**${chName}** (${chRank}) vs **${opName}** (${opRank})\n\n` +
              `The fight time has arrived. Select the winner below.\n` +
              `If the challenger (lower rank) wins, ranks swap.\n` +
              `If the opponent (higher rank) wins, ranks stay. Winner gets +1W, loser gets +1L.`;

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`dm_win_challenger:${ticket._id}:normal`).setLabel(`${chName} Wins`).setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`dm_win_opponent:${ticket._id}:normal`).setLabel(`${opName} Wins`).setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`dm_invalid:${ticket._id}:normal`).setLabel('Invalid').setStyle(ButtonStyle.Danger),
            ) as any;

            if ('send' in dmChannel) {
              await (dmChannel as any).send({ content: dmText, components: [row] });
              logger.info(`Winner DM sent to referee ${ticket.claimedBy} for ticket ${ticket._id}`);
            }
          }
        } catch (dmError) {
          logger.error(`Failed to DM referee for ticket ${ticket._id}:`, dmError);
        }
      }

      await discordLog('Fight Opened', `**Challenger:** ${chName}\n**Opponent:** ${opName}\n**Type:** ${ticket.fightType}\n**Channel:** <#${ticket.channelId}>`, 'info');
      logger.info(`Fight auto-opened for ticket ${ticket._id}`);
    } catch (error) {
      logger.error(`Failed to auto-open fight for ticket ${ticket._id}:`, error);
    }
  }

  // 8. Refresh leaderboard for all guilds with changes
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
