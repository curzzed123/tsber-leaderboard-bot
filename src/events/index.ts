import { Client, Events } from 'discord.js';
import { logger } from '../utils/logger.js';

import { execute as readyExecute } from './ready.js';
import { execute as interactionExecute } from './interactionCreate.js';
import { execute as messageExecute } from './messageCreate.js';

export function registerEvents(client: Client): void {
  // clientReady (once)
  client.once(Events.ClientReady, (...args) => readyExecute(...args));

  // interactionCreate
  client.on(Events.InteractionCreate, async (interaction) => {
    const anyInteraction = interaction as any;
    logger.info(`Interaction: type=${interaction.type} customId=${anyInteraction.customId ?? 'N/A'} cmd=${anyInteraction.commandName ?? 'N/A'}`);
    try {
      await interactionExecute(interaction);
    } catch (error) {
      logger.error(`FATAL interaction error:`, error);
      try {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'An error occurred. Please try again.', ephemeral: true });
        }
      } catch {
        // Interaction expired
      }
    }
  });

  // messageCreate
  client.on(Events.MessageCreate, (message) => messageExecute(message));

  logger.info('Event handlers registered');
}
