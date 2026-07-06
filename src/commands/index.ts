import type { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';

export interface SlashCommand {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

import { forcewin } from './forcewin.js';
import { setrank } from './setrank.js';
import { approveLoa } from './approve-loa.js';
import { freezeTimer } from './freeze-timer.js';
import { closeTicketCmd } from './close-ticket.js';
import { modify } from './modify.js';
import { result } from './result.js';

export const commands: SlashCommand[] = [
  forcewin,
  setrank,
  approveLoa,
  freezeTimer,
  closeTicketCmd,
  modify,
  result,
];
