import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasStaffPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { refreshLeaderboard } from '../services/leaderboard.js';

export const setrank: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('setrank')
    .setDescription('Place or update a player on the leaderboard')
    .addUserOption((option) =>
      option.setName('user').setDescription('The player').setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('rank')
        .setDescription('Leaderboard spot 1-30, or 0 for unranked')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(30)
        .setAutocomplete(true),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | AutocompleteInteraction): Promise<void> {
    // Autocomplete — show rank options as user types
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const choices = [
        { name: 'Unranked (Stage 0)', value: 0 },
        ...Array.from({ length: 30 }, (_, i) => ({ name: `Rank #${i + 1}`, value: i + 1 })),
      ];
      const filtered = focused === ''
        ? choices.slice(0, 25)
        : choices.filter((c) => c.name.toLowerCase().includes(focused.toLowerCase())).slice(0, 25);
      await interaction.respond(filtered);
      return;
    }

    const cmd = interaction as ChatInputCommandInteraction;

    if (!hasStaffPermission(cmd.member as any)) {
      await cmd.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only staff (Administrator) can use this command.')], ephemeral: true });
      return;
    }

    const targetUser = cmd.options.getUser('user', true);
    const rankValue = cmd.options.getInteger('rank', true);

    const guildId = cmd.guildId!;

    const player = await Player.findOne({ guildId, discordId: targetUser.id });
    if (!player) {
      await cmd.reply({ embeds: [createErrorEmbed('Player Not Found', `${targetUser.username} is not registered. They must click [Create] first.`)], ephemeral: true });
      return;
    }

    const oldRank = player.rank;

    if (rankValue === 0) {
      player.rank = null;
      player.stage = 'Stage 0';
    } else {
      player.rank = rankValue;
      player.stage = 'Ranked';
    }

    await player.save();
    logger.info(`DB UPDATED: ${player.robloxUsername} rank set to ${player.rank} (was ${oldRank})`);

    await refreshLeaderboard(guildId);

    await cmd.reply({
      embeds: [createSuccessEmbed(
        'Rank Updated',
        `**${player.robloxUsername}** — ${oldRank ? `#${oldRank}` : 'Unranked'} → ${player.rank ? `#${player.rank}` : 'Unranked'}\n\n*Leaderboard updated.*`,
      )],
    });
  },
};
