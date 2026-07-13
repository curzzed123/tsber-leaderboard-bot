import type { Message } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { updateTicketActivity } from '../services/ticketFlow.js';
import { logger } from '../utils/logger.js';

export async function execute(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guildId) return;

  // Update ticket activity
  await updateTicketActivity(message.channelId, message.author.id);

  // $add @user — add a user to this ticket channel
  if (message.content.startsWith('$add')) {
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
      await message.reply('Usage: `$add @user`');
      return;
    }

    try {
      const channel = message.channel;
      if (channel && 'permissionOverwrites' in channel) {
        await (channel as any).permissionOverwrites.edit(mentionedUser.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await message.reply(`Added <@${mentionedUser.id}> to this ticket.`);
        logger.info(`User ${mentionedUser.id} added to ticket ${message.channelId} by ${message.author.id}`);
      }
    } catch (error) {
      logger.error('Failed to add user to ticket:', error);
      await message.reply('Failed to add user. Make sure I have the right permissions.');
    }
  }
}
