import type { Client } from 'discord.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { commands } from '../commands/index.js';
import { initLeaderboardMessages } from '../services/leaderboard.js';
import { setupTicketPanel } from '../services/ticketPanel.js';
import { REST, Routes } from 'discord.js';

export async function execute(client: Client): Promise<void> {
  logger.info(`Logged in as ${client.user?.tag}`);

  // Store client globally for leaderboard refresh
  (globalThis as any).client = client;

  // Register slash commands — PUT replaces all existing commands (clears old ones)
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    const commandData = commands.map((cmd) => cmd.data.toJSON());

    // Clear global commands first (in case old ones are cached)
    await rest.put(Routes.applicationCommands(client.user!.id), { body: [] });
    logger.info('Cleared global slash commands');

    // Register guild commands (instant update)
    if (config.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(client.user!.id, config.guildId),
        { body: commandData },
      );
      logger.info(`Registered ${commandData.length} guild slash commands`);
    } else {
      await rest.put(
        Routes.applicationCommands(client.user!.id),
        { body: commandData },
      );
      logger.info(`Registered ${commandData.length} global slash commands`);
    }
  } catch (error) {
    logger.error('Failed to register slash commands:', error);
  }

  // Initialize leaderboards (hardcoded channels)
  try {
    await initLeaderboardMessages(client);
  } catch (error) {
    logger.error('Failed to init leaderboards:', error);
  }

  // Initialize ticket panel (hardcoded channel)
  try {
    await setupTicketPanel(client, config.guildId);
  } catch (error) {
    logger.error('Failed to init ticket panel:', error);
  }

  logger.info('Bot is ready.');
}
