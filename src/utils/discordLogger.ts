import { EmbedBuilder, TextChannel, type Client } from 'discord.js';
import { logger } from '../utils/logger.js';

const LOG_CHANNEL_ID = '1521245230505005118';

let clientRef: Client | null = null;

export function setLogClient(client: Client): void {
  clientRef = client;
}

/**
 * Log an event to the Discord log channel.
 * Color-coded by type: green=success, red=error, yellow=warning, blue=info.
 */
export async function discordLog(title: string, description: string, type: 'success' | 'error' | 'warn' | 'info' = 'info'): Promise<void> {
  if (!clientRef) return;

  try {
    const channel = await clientRef.channels.fetch(LOG_CHANNEL_ID) as TextChannel;
    if (!channel) return;

    const colors = {
      success: 0x57F287, // green
      error: 0xED4245,   // red
      warn: 0xFEE75C,    // yellow
      info: 0x5865F2,    // blue
    };

    const icons = {
      success: '✅',
      error: '❌',
      warn: '⚠️',
      info: '📋',
    };

    const embed = new EmbedBuilder()
      .setTitle(`${icons[type]} ${title}`)
      .setColor(colors[type])
      .setDescription(description)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    // Don't let logging failures crash the bot
    logger.error('Failed to send Discord log:', error);
  }
}
