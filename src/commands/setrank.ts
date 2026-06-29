import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { PlayerStatus, Region } from '../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasStaffPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { refreshLeaderboard } from '../services/leaderboard.js';
import { discordLog } from '../utils/discordLogger.js';

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
        .setDescription('Leaderboard spot 1-30')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(30)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('region')
        .setDescription('Player region')
        .setRequired(false)
        .addChoices(
          { name: 'EU', value: 'EU' },
          { name: 'AS', value: 'AS' },
          { name: 'NA', value: 'NA' },
        ),
    )
    .addIntegerOption((option) =>
      option.setName('wins').setDescription('Set total win count').setRequired(false).setMinValue(0),
    )
    .addIntegerOption((option) =>
      option.setName('losses').setDescription('Set total loss count').setRequired(false).setMinValue(0),
    )
    .addStringOption((option) =>
      option
        .setName('stage')
        .setDescription('Stage label (e.g. Stage 1, Ranked, OLS)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('status')
        .setDescription('Override player status')
        .setRequired(false)
        .addChoices(
          { name: 'Challengeable', value: PlayerStatus.IDLE },
          { name: 'Challenging', value: PlayerStatus.CHALLENGING },
          { name: 'Challenged', value: PlayerStatus.CHALLENGED },
          { name: 'Immune', value: PlayerStatus.IMMUNE },
          { name: 'Cooldown', value: PlayerStatus.COOLDOWN },
        ),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | AutocompleteInteraction): Promise<void> {
    // Autocomplete — show rank 1-30
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const choices = Array.from({ length: 30 }, (_, i) => ({
        name: `Rank #${i + 1}`,
        value: i + 1,
      }));
      const filtered = focused === '' || isNaN(Number(focused))
        ? choices.filter((c) => c.name.toLowerCase().includes(String(focused).toLowerCase())).slice(0, 25)
        : choices.filter((c) => c.value === Number(focused) || String(c.value).includes(String(focused))).slice(0, 25);
      if (filtered.length === 0) {
        // If user typed a number 1-30, show it directly
        const num = Number(focused);
        if (num >= 1 && num <= 30) {
          await interaction.respond([{ name: `Rank #${num}`, value: num }]);
          return;
        }
        await interaction.respond(choices.slice(0, 25));
        return;
      }
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
    const region = cmd.options.getString('region');
    const wins = cmd.options.getInteger('wins');
    const losses = cmd.options.getInteger('losses');
    const stage = cmd.options.getString('stage');
    const status = cmd.options.getString('status');

    const guildId = cmd.guildId!;

    const player = await Player.findOne({ guildId, discordId: targetUser.id });
    if (!player) {
      await cmd.reply({ embeds: [createErrorEmbed('Player Not Found', `${targetUser.username} is not registered. They must click [Create] first.`)], ephemeral: true });
      return;
    }

    const oldRank = player.rank;

    // Update rank
    player.rank = rankValue;
    player.stage = stage ?? 'Ranked';

    // Update optional fields if provided
    if (region) player.region = region as Region;
    if (wins !== null) player.wins = wins;
    if (losses !== null) player.losses = losses;
    if (status) player.status = status as PlayerStatus;

    await player.save();
    logger.info(`DB UPDATED: ${player.robloxUsername} rank set to #${player.rank} (was ${oldRank ?? 'Unranked'})`);

    // Build confirmation message showing what was set
    const fields: string[] = [`**Rank:** ${oldRank ? `#${oldRank}` : 'Unranked'} → #${player.rank}`];
    if (region) fields.push(`**Region:** ${region}`);
    if (wins !== null) fields.push(`**Wins:** ${wins}`);
    if (losses !== null) fields.push(`**Losses:** ${losses}`);
    if (stage) fields.push(`**Stage:** ${stage}`);
    if (status) fields.push(`**Status:** ${status}`);

    // Reply IMMEDIATELY — before leaderboard refresh
    await cmd.reply({
      embeds: [createSuccessEmbed(
        'Player Updated',
        `**${player.robloxUsername}**\n\n${fields.join('\n')}\n\n*Leaderboard updated.*`,
      )],
    });

    // Refresh leaderboard — log any errors so they show up in Railway
    try {
      logger.info('Starting leaderboard refresh...');
      await refreshLeaderboard(guildId);
      logger.info('Leaderboard refresh complete.');
    } catch (error) {
      logger.error('Leaderboard refresh FAILED:', error);
    }

    // Log to the log channel
    const logParts: string[] = [`**${player.robloxUsername}** — ${oldRank ? `#${oldRank}` : 'Unranked'} → **#${player.rank}**`];
    if (region) logParts.push(`Region: ${region}`);
    if (wins !== null) logParts.push(`Wins: ${wins}`);
    if (losses !== null) logParts.push(`Losses: ${losses}`);
    if (stage) logParts.push(`Stage: ${stage}`);
    if (status) logParts.push(`Status: ${status}`);
    logParts.push(`By: <@${cmd.user.id}>`);
    await discordLog('Spot Updated', logParts.join('\n'), 'success');
  },
};
