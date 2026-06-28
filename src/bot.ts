import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { logger } from './utils/logger.js';

export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // Privileged — enable in Discord Developer Portal
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [
      Partials.Channel,
      Partials.Message,
      Partials.Reaction,
      Partials.GuildMember,
    ],
  });

  client.on('warn', (message) => logger.warn(`Discord.js warning: ${message}`));
  client.on('error', (error) => logger.error('Discord.js error:', error));
  client.on('shardError', (error) => logger.error('Shard error:', error));
  client.on('shardDisconnect', (event) => logger.warn(`Shard disconnected: ${event.reason}`));
  client.on('shardReconnecting', () => logger.info('Shard reconnecting...'));
  client.on('shardResume', () => logger.info('Shard resumed'));

  return client;
}
