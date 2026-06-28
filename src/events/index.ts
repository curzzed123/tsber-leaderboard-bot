import type { Client } from 'discord.js';
import * as readyEvent from './ready.js';
import * as interactionCreateEvent from './interactionCreate.js';
import * as messageCreateEvent from './messageCreate.js';
import { logger } from '../utils/logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventExecute = (...args: any[]) => Promise<void>;
interface EventModule {
  name: string;
  once?: boolean;
  execute: EventExecute;
}

export function registerEvents(client: Client): void {
  const ready = readyEvent as unknown as EventModule;
  const interactionCreate = interactionCreateEvent as unknown as EventModule;
  const messageCreate = messageCreateEvent as unknown as EventModule;

  // ready event (once)
  if (ready.once) {
    client.once(ready.name, (...args: unknown[]) => ready.execute(...args));
  } else {
    client.on(ready.name, (...args: unknown[]) => ready.execute(...args));
  }

  // interactionCreate
  client.on(interactionCreate.name, (...args: unknown[]) => interactionCreate.execute(...args));

  // messageCreate
  client.on(messageCreate.name, (...args: unknown[]) => messageCreate.execute(...args));

  logger.info('Event handlers registered');
}
