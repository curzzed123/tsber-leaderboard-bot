import type { Message } from 'discord.js';
import { updateTicketActivity } from '../services/ticketFlow.js';
import { logger } from '../utils/logger.js';

export async function execute(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guildId) return;

  // Update ticket activity
  await updateTicketActivity(message.channelId, message.author.id);

  const content = message.content.toLowerCase();

  // $add @user or $add userid — add a user to this ticket channel
  if (content.startsWith('$add')) {
    await handleAddRemove(message, 'add');
    return;
  }

  // $remove @user or $remove userid — remove a user from this ticket channel
  if (content.startsWith('$remove')) {
    await handleAddRemove(message, 'remove');
    return;
  }
}

async function handleAddRemove(message: Message, action: 'add' | 'remove'): Promise<void> {
  let userId: string | undefined;

  // Check for mentioned user first
  const mentionedUser = message.mentions.users.first();
  if (mentionedUser) {
    userId = mentionedUser.id;
  } else {
    // Extract the raw ID after the command
    const cmdLen = action === 'add' ? 4 : 7; // "$add" = 4, "$remove" = 7
    const raw = message.content.slice(cmdLen).trim();
    // Remove any <@! > wrapping
    const cleaned = raw.replace(/[<@!>]/g, '').trim();
    if (/^\d+$/.test(cleaned) && cleaned.length >= 17) {
      userId = cleaned;
    }
  }

  if (!userId) {
    await message.reply(`Usage: \`$${action} @user\` or \`$${action} userid\``);
    return;
  }

  try {
    const guild = message.guild;
    if (!guild) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      await message.reply('User not found in this server.');
      return;
    }

    const channel = message.channel;
    if (channel && 'permissionOverwrites' in channel) {
      if (action === 'add') {
        await (channel as any).permissionOverwrites.edit(member, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await message.reply(`Added <@${userId}> to this ticket.`);
      } else {
        await (channel as any).permissionOverwrites.delete(member);
        await message.reply(`Removed <@${userId}> from this ticket.`);
      }
      logger.info(`User ${userId} ${action}ed from ticket ${message.channelId} by ${message.author.id}`);
    }
  } catch (error) {
    logger.error(`Failed to ${action} user:`, error);
    await message.reply(`Failed to ${action} user. Make sure the ID is valid.`);
  }
}
