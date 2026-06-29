import type { Client } from 'discord.js';
import { logger } from '../utils/logger.js';

import { execute as readyExecute, name as readyName, once as readyOnce } from './ready.js';
import { execute as interactionExecute, name as interactionName } from './interactionCreate.js';
import { execute as messageExecute, name as messageName } from './messageCreate.js';

export function registerEvents(client: Client): void {
  // ready event
  if (readyOnce) {
    client.once(readyName, (...args) => readyExecute(...args));
  } else {
    client.on(readyName, (...args) => readyExecute(...args));
  }

  // interactionCreate — log every interaction for debugging
  client.on(interactionName, async (...args) => {
    const interaction = args[0] as any;
    try {
      logger.info(`Interaction received: type=${interaction.type} customId=${interaction.customId ?? 'N/A'} command=${interaction.commandName ?? 'N/A'}`);
      await interactionExecute(interaction);
    } catch (error) {
      logger.error(`FATAL interaction error: type=${interaction.type} customId=${interaction.customId}:`, error);
      try {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'An error occurred. Please try again.', ephemeral: true });
        }
      } catch {
        // Can't reply — interaction may have expired
      }
    }
  });

  // messageCreate
  client.on(messageName, (...args) => messageExecute(...args));

  // Log all debug events
  client.on('debug', (msg) => logger.debug(`[discord.js] ${msg}`));

  logger.info('Event handlers registered');
}
