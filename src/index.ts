import { createClient } from './bot.js';
import { connectDatabase } from './database/connect.js';
import { registerEvents } from './events/index.js';
import { startScheduler } from './services/scheduler.js';
import { reconcileStuckPlayers } from './services/reconcile.js';
import { startKeepAlive } from './utils/keepAlive.js';
import { setLogClient, discordLog } from './utils/discordLogger.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  startKeepAlive();

  if (!config.token) {
    logger.error('DISCORD_TOKEN is not set.');
    process.exit(1);
  }

  await connectDatabase(config.mongodbUri);

  const client = createClient();

  // Set up Discord logging
  setLogClient(client);

  // Log crashes to Discord
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception:', error);
    await discordLog('Bot Crash', `\`\`\`${error.message}\`\`\``, 'error');
  });

  process.on('unhandledRejection', async (reason) => {
    logger.error('Unhandled Rejection:', reason);
    await discordLog('Unhandled Rejection', `\`\`\`${String(reason)}\`\`\``, 'error');
  });

  registerEvents(client);
  await client.login(config.token);
  startScheduler(client);
  await reconcileStuckPlayers();

  logger.info('Bot is fully operational.');
  await discordLog('Bot Started', 'Bot is online and fully operational.', 'success');
}

main().catch(async (error) => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});
