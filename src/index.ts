import { createClient } from './bot.js';
import { connectDatabase } from './database/connect.js';
import { registerEvents } from './events/index.js';
import { startScheduler } from './services/scheduler.js';
import { reconcileStuckPlayers } from './services/reconcile.js';
import { startKeepAlive } from './utils/keepAlive.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  // Start keep-alive HTTP server (for Replit hosting)
  startKeepAlive();

  // Validate required config
  if (!config.token) {
    logger.error('DISCORD_TOKEN is not set. Add it in Replit Secrets or .env.');
    process.exit(1);
  }

  // Connect to MongoDB
  await connectDatabase(config.mongodbUri);

  // Create and configure client
  const client = createClient();

  // Register event handlers
  registerEvents(client);

  // Login to Discord
  await client.login(config.token);

  // Start the periodic scheduler (dodge, inactivity, cooldown, immunity sweeps)
  startScheduler(client);

  // Reconcile any stuck players from a previous crash
  await reconcileStuckPlayers();

  logger.info('Bot is fully operational.');
}

main().catch((error) => {
  logger.error('Fatal error during startup:', error);
  process.exit(1);
});
