import { ChannelType, PermissionFlagsBits, type Client, type TextChannel, type Guild, type ChannelCreationOverwrites } from 'discord.js';
import { Ticket } from '../database/models/Ticket.js';
import { Player } from '../database/models/Player.js';
import { getGuildConfig, getGuildDurations } from '../database/models/GuildConfig.js';
import { PlayerStatus, TicketStatus } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { resolveMatch } from './rankShift.js';
import { refreshLeaderboard } from './leaderboard.js';
import { createBaseEmbed, createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { formatRank, discordTimestamp, discordTimestampFull } from '../utils/formatting.js';
import type { ITicket } from '../database/models/Ticket.js';
import type { IPlayer } from '../database/models/Player.js';
import type { MatchOutcome } from '../types/index.js';

/**
 * Create a private ticket channel for a challenge.
 * - Creates a channel named ticket-challenger-vs-opponent
 * - Sets permissions for both participants + referees
 * - Pings the referees role once
 * - Creates a Ticket document and links it to both players
 */
export async function createTicket(
  client: Client,
  guildId: string,
  challenger: IPlayer,
  opponent: IPlayer,
): Promise<ITicket | null> {
  const guildConfig = await getGuildConfig(guildId);
  const durations = await getGuildDurations(guildId);
  const guild = client.guilds.cache.get(guildId);

  if (!guild) {
    logger.error(`Guild ${guildId} not found`);
    return null;
  }

  // Sanitize usernames for channel name
  const sanitize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
  const challengerName = sanitize(challenger.robloxUsername);
  const opponentName = sanitize(opponent.robloxUsername);
  const channelName = `ticket-${challengerName}-vs-${opponentName}`;

  // Determine parent category
  const parentId = guildConfig.ticketsCategoryId || undefined;

  // Create the channel with permissions
  const overwrites: ChannelCreationOverwrites[] = [
    {
      id: guild.id, // @everyone
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: challenger.discordId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: opponent.discordId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
  ];

  // Add referees role
  if (guildConfig.refereesRoleId) {
    overwrites.push({
      id: guildConfig.refereesRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  // Add staff roles
  for (const staffRoleId of guildConfig.staffRoleIds) {
    overwrites.push({
      id: staffRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  // Ensure the bot can see and send in the channel
  overwrites.push({
    id: client.user!.id,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
  });

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: parentId,
    permissionOverwrites: overwrites,
    topic: `Challenge: ${challenger.robloxUsername} (#${challenger.rank}) vs ${opponent.robloxUsername} (#${opponent.rank})`,
  });

  // Calculate deadlines
  const now = new Date();
  const dodgeDeadline = new Date(now.getTime() + durations.dodgeMs);
  const inactivityDeadline = new Date(now.getTime() + durations.inactivityMs);

  // Create the Ticket document
  const ticket = await Ticket.create({
    guildId,
    channelId: channel.id,
    challengerDiscordId: challenger.discordId,
    opponentDiscordId: opponent.discordId,
    status: TicketStatus.OPEN,
    dodgeDeadline,
    inactivityDeadline,
    lastActivityAt: now,
    opponentResponded: false,
    frozen: false,
    frozenAt: null,
    freezeAccumulatedMs: 0,
    outcome: null,
    closedAt: null,
    closedBy: null,
    reason: '',
  });

  // Update player statuses
  challenger.status = PlayerStatus.CHALLENGING;
  challenger.activeTicketId = ticket._id;
  await challenger.save();

  opponent.status = PlayerStatus.CHALLENGED;
  opponent.activeTicketId = ticket._id;
  await opponent.save();

  // Send the initial ticket message
  const embed = createBaseEmbed(
    '⚔️ Challenge Ticket',
    `**${challenger.robloxUsername}** (${formatRank(challenger.rank)}) has challenged **${opponent.robloxUsername}** (${formatRank(opponent.rank)})!`,
  )
    .addFields(
      {
        name: '🎯 Challenger',
        value: `<@${challenger.discordId}> — ${challenger.robloxUsername}\nRank: ${formatRank(challenger.rank)} | Region: ${challenger.region}`,
        inline: true,
      },
      {
        name: '🛡️ Opponent',
        value: `<@${opponent.discordId}> — ${opponent.robloxUsername}\nRank: ${formatRank(opponent.rank)} | Region: ${opponent.region}`,
        inline: true,
      },
      {
        name: '⏰ Dodge Deadline',
        value: `Opponent must respond by ${discordTimestampFull(dodgeDeadline)} (${discordTimestamp(dodgeDeadline)})\nIf no response, auto-win to challenger.`,
      },
      {
        name: '📋 Instructions',
        value: '1. Both fighters schedule a time to fight.\n2. A referee must be present.\n3. Use `/close-ticket` to report the result.\n4. If you need more time, use `/freeze-timer` (both fighters must agree).',
      },
    )
    .setColor(0x5865F2);

  // Ping referees role
  const refereePing = guildConfig.refereesRoleId
    ? `<@&${guildConfig.refereesRoleId}>`
    : '';
  await channel.send({
    content: `<@${challenger.discordId}> <@${opponent.discordId}> ${refereePing} A new challenge has been issued!`,
    embeds: [embed],
  });

  logger.info(`Ticket created: ${challenger.robloxUsername} vs ${opponent.robloxUsername} (channel: ${channel.id})`);

  // Refresh leaderboard to show new statuses
  await refreshLeaderboard(guildId);

  return ticket;
}

/**
 * Update the last activity timestamp for a ticket.
 * Called when a participant sends a message in the ticket channel.
 */
export async function updateTicketActivity(
  channelId: string,
  authorDiscordId: string,
): Promise<void> {
  const ticket = await Ticket.findOne({ channelId, status: { $in: [TicketStatus.OPEN, TicketStatus.FROZEN] } });
  if (!ticket) return;

  // Only update if the author is a participant
  if (authorDiscordId !== ticket.challengerDiscordId && authorDiscordId !== ticket.opponentDiscordId) {
    return;
  }

  const durations = await getGuildDurations(ticket.guildId);

  ticket.lastActivityAt = new Date();

  // Recalculate inactivity deadline (only if not frozen)
  if (!ticket.frozen) {
    ticket.inactivityDeadline = new Date(Date.now() + durations.inactivityMs);
  }

  // Mark opponent as responded
  if (authorDiscordId === ticket.opponentDiscordId && !ticket.opponentResponded) {
    ticket.opponentResponded = true;
  }

  await ticket.save();
}

/**
 * Freeze or unfreeze a ticket's timers.
 * Used by /freeze-timer when both fighters agree to delay.
 */
export async function toggleFreezeTicket(ticket: ITicket): Promise<boolean> {
  const durations = await getGuildDurations(ticket.guildId);

  if (!ticket.frozen) {
    // Freeze
    ticket.frozen = true;
    ticket.frozenAt = new Date();
    ticket.status = TicketStatus.FROZEN;
  } else {
    // Unfreeze
    if (ticket.frozenAt) {
      const frozenDuration = Date.now() - ticket.frozenAt.getTime();
      ticket.freezeAccumulatedMs += frozenDuration;

      // Recalculate deadlines
      ticket.dodgeDeadline = new Date(
        ticket.dodgeDeadline.getTime() + frozenDuration,
      );
      ticket.inactivityDeadline = new Date(
        Date.now() + durations.inactivityMs,
      );
    }
    ticket.frozen = false;
    ticket.frozenAt = null;
    ticket.status = TicketStatus.OPEN;
  }

  await ticket.save();
  return ticket.frozen;
}

/**
 * Close a ticket channel and resolve the match.
 */
export async function closeTicket(
  client: Client,
  ticket: ITicket,
  outcome: MatchOutcome,
  closedBy: string,
  reason?: string,
): Promise<void> {
  // Resolve the match (rank shifts, cooldowns, etc.)
  await resolveMatch(ticket, outcome, closedBy);

  if (reason) {
    ticket.reason = reason;
    await ticket.save();
  }

  // Try to close the channel
  try {
    const channel = await client.channels.fetch(ticket.channelId);
    if (channel && channel.isTextBased()) {
      const textChannel = channel as TextChannel;

      // Send closure message
      const outcomeText: Record<MatchOutcome, string> = {
        WIN_CHALLENGER: '🏆 **Challenger Wins!**',
        WIN_OPPONENT: '🛡️ **Opponent Wins!**',
        INVALID: '❌ **Ticket Closed (Invalid)**',
      };

      const embed = createSuccessEmbed('Ticket Closed', outcomeText[outcome]);
      if (reason) {
        embed.addFields({ name: 'Reason', value: reason });
      }
      embed.setFooter({ text: `Closed by ${closedBy}` });

      await textChannel.send({ embeds: [embed] });

      // Delete the channel after a short delay
      setTimeout(async () => {
        try {
          await textChannel.delete();
        } catch {
          // Channel might already be deleted
        }
      }, 5000);
    }
  } catch (error) {
    logger.error(`Failed to close ticket channel ${ticket.channelId}:`, error);
  }
}
