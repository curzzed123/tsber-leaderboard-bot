import type { Message } from 'discord.js';
import { updateTicketActivity } from '../services/ticketFlow.js';
import { logger } from '../utils/logger.js';

export async function execute(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guildId) return;

  // Update ticket activity
  await updateTicketActivity(message.channelId, message.author.id);

  // $add @user or $add userid — add a user to this ticket channel
  if (message.content.toLowerCase().startsWith('$add')) {
    let userId: string | undefined;

    // Check for mentioned user first
    const mentionedUser = message.mentions.users.first();
    if (mentionedUser) {
      userId = mentionedUser.id;
    } else {
      // Extract the raw ID — grab everything after "$add " and strip non-digits
      const raw = message.content.slice(4).trim();
      // Remove any <@! > wrapping if someone pasted a mention as text
      const cleaned = raw.replace(/[<@!>]/g, '').trim();
      if (/^\d+$/.test(cleaned) && cleaned.length >= 17) {
        userId = cleaned;
      }
    }

    if (!userId) {
      await message.reply('Usage: `$add @user` or `$add userid`');
      return;
    }

    try {
      const guild = message.guild;
      if (!guild) return;

      // Fetch the member to get a valid object for permissionOverwrites
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        await message.reply('User not found in this server.');
        return;
      }

      const channel = message.channel;
      if (channel && 'permissionOverwrites' in channel) {
        await (channel as any).permissionOverwrites.edit(member, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await message.reply(`Added <@${userId}> to this ticket.`);
        logger.info(`User ${userId} added to ticket ${message.channelId} by ${message.author.id}`);
      }
    } catch (error) {
      logger.error('Failed to add user to ticket:', error);
      await message.reply('Failed to add user. Make sure the ID is valid.');
    }
  }
}
