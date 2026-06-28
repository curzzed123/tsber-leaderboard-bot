import type { Message } from 'discord.js';
import { updateTicketActivity } from '../services/ticketFlow.js';

export const name = 'messageCreate';

export async function execute(message: Message): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;

  // Ignore DMs
  if (!message.guildId) return;

  // Update ticket activity if this message is in a ticket channel
  // This is a cheap DB lookup — if no ticket matches, it returns immediately
  await updateTicketActivity(message.channelId, message.author.id);
}
