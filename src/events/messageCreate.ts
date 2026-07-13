import type { Message } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { updateTicketActivity } from '../services/ticketFlow.js';
import { logger } from '../utils/logger.js';

export async function execute(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guildId) return;

  // Update ticket activity
  await updateTicketActivity(message.channelId, message.author.id);

  // $add @user or $add userid — add a user to this ticket channel
  if (message.content.startsWith('$add')) {
    let userId: string | undefined;

    // Check for mentioned user first
    const mentionedUser = message.mentions.users.first();
    if (mentionedUser) {
      userId = mentionedUser.id;
    } else {
      // Try to extract user ID from the message
      const match = message.content.match(/\$add\s+(\d{17,19})/);
      if (match) {
        userId = match[1];
      }
    }

    if (!userId) {
      await message.reply('Usage: `$add @user` or `$add userid`');
      return;
    }

    try {
      const channel = message.channel;
      if (channel && 'permissionOverwrites' in channel) {
        await (channel as any).permissionOverwrites.edit(userId, {
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
