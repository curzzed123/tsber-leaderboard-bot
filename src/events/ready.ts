import type { Client } from 'discord.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { commands } from '../commands/index.js';
import { initLeaderboardMessages } from '../services/leaderboard.js';
import { setupTicketPanel } from '../services/ticketPanel.js';
import { setupPingRoles } from '../services/pingRoles.js';
import { setupStaffList } from '../services/staffList.js';
import { updateAllRoles } from '../services/roles.js';
import { REST, Routes } from 'discord.js';

export async function execute(client: Client): Promise<void> {
  logger.info(`Logged in as ${client.user?.tag}`);

  // Store client globally for leaderboard refresh
  (globalThis as any).client = client;

  // Set bot presence
  const { ActivityType } = await import('discord.js');
  client.user?.setPresence({
    activities: [{
      name: 'over Ryūkai',
      type: ActivityType.Watching,
    }],
    status: 'online',
  });

  // Set bot avatar
  try {
    const avatarUrl = 'https://cdn.discordapp.com/attachments/1517869005690638477/1523815012836311060/54c00e71c0e4c2f5034b3e1f4a46fe0e.gif';
    const response = await fetch(avatarUrl);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      await client.user?.setAvatar(buffer);
    }
  } catch (error) {
    // Avatar change might be rate-limited — that's fine
  }

  // Set bot username/bio with Discord invite
  try {
    await client.user?.setUsername('Ryūkai');
  } catch {}

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

  // Initialize ping roles panel
  try {
    await setupPingRoles(client);
  } catch (error) {
    logger.error('Failed to init ping roles:', error);
  }

  // Initialize staff list
  try {
    await setupStaffList(client);
  } catch (error) {
    logger.error('Failed to init staff list:', error);
  }

  // Sync roles for all players on startup
  try {
    await updateAllRoles(client);
  } catch (error) {
    logger.error('Failed to sync roles:', error);
  }

  logger.info('Bot is ready.');
}
