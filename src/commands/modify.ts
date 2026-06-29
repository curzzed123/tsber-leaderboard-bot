import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { PlayerStatus } from '../types/index.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasStaffPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { refreshLeaderboard } from '../services/leaderboard.js';
import { discordLog } from '../utils/discordLogger.js';

export const modify: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('modify')
    .setDescription('Modify a player\'s stats, status, region, or stage')
    .addUserOption((option) =>
      option.setName('user').setDescription('The player to modify').setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('wins').setDescription('Set total wins').setRequired(false).setMinValue(0),
    )
    .addIntegerOption((option) =>
      option.setName('losses').setDescription('Set total losses').setRequired(false).setMinValue(0),
    )
    .addIntegerOption((option) =>
      option.setName('streak').setDescription('Set current streak (positive=W, negative=L)').setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('status')
        .setDescription('Set player status')
        .setRequired(false)
        .addChoices(
          { name: 'Challengeable', value: PlayerStatus.IDLE },
          { name: 'Challenging', value: PlayerStatus.CHALLENGING },
          { name: 'Challenged', value: PlayerStatus.CHALLENGED },
          { name: 'Immune', value: PlayerStatus.IMMUNE },
          { name: 'Cooldown', value: PlayerStatus.COOLDOWN },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('region')
        .setDescription('Set player region')
        .setRequired(false)
        .addChoices(
          { name: 'EU', value: 'EU' },
          { name: 'AS', value: 'AS' },
          { name: 'NA', value: 'NA' },
        ),
    )
    .addStringOption((option) =>
      option.setName('stage').setDescription('Set stage label (e.g. Ranked, OLS, Stage 1)').setRequired(false),
    )
    .addIntegerOption((option) =>
      option.setName('rank').setDescription('Set rank position 1-30').setRequired(false).setMinValue(1).setMaxValue(30).setAutocomplete(true),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Handle autocomplete
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused();
      const choices = Array.from({ length: 30 }, (_, i) => ({ name: `Rank #${i + 1}`, value: i + 1 }));
      const filtered = focused === '' || isNaN(Number(focused))
        ? choices.filter((c) => c.name.toLowerCase().includes(String(focused).toLowerCase())).slice(0, 25)
        : choices.filter((c) => c.value === Number(focused) || String(c.value).includes(String(focused))).slice(0, 25);
      await interaction.respond(filtered.length > 0 ? filtered : choices.slice(0, 25));
      return;
    }

    if (!hasStaffPermission(interaction.member as any)) {
      await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only staff (Administrator) can use this command.')], ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const wins = interaction.options.getInteger('wins');
    const losses = interaction.options.getInteger('losses');
    const streak = interaction.options.getInteger('streak');
    const status = interaction.options.getString('status');
    const region = interaction.options.getString('region');
    const stage = interaction.options.getString('stage');
    const rank = interaction.options.getInteger('rank');

    const guildId = interaction.guildId!;

    const player = await Player.findOne({ guildId, discordId: targetUser.id });
    if (!player) {
      await interaction.reply({ embeds: [createErrorEmbed('Player Not Found', `${targetUser.username} is not registered.`)], ephemeral: true });
      return;
    }

    // Track changes
    const changes: string[] = [];

    if (wins !== null) { changes.push(`Wins: ${player.wins} → ${wins}`); player.wins = wins; }
    if (losses !== null) { changes.push(`Losses: ${player.losses} → ${losses}`); player.losses = losses; }
    if (streak !== null) { changes.push(`Streak: ${player.streak} → ${streak}`); player.streak = streak; }
    if (status) {
      const oldStatus = player.status;
      player.status = status as PlayerStatus;
      changes.push(`Status: ${oldStatus} → ${status}`);
      if (status === PlayerStatus.IDLE) {
        player.cooldownUntil = null;
        player.immunityUntil = null;
      }
    }
    if (region) { changes.push(`Region: ${player.region} → ${region}`); player.region = region as any; }
    if (stage) { changes.push(`Stage: ${player.stage} → ${stage}`); player.stage = stage; }
    if (rank !== null) { changes.push(`Rank: ${player.rank ? `#${player.rank}` : 'Unranked'} → #${rank}`); player.rank = rank; }

    if (changes.length === 0) {
      await interaction.reply({ embeds: [createErrorEmbed('No Changes', 'No fields were provided. Specify at least one field to modify.')], ephemeral: true });
      return;
    }

    await player.save();
    logger.info(`Player modified: ${player.robloxUsername} by ${interaction.user.id} — ${changes.join(', ')}`);

    // Reply immediately
    await interaction.reply({
      embeds: [createSuccessEmbed(
        'Player Modified',
        `**${player.robloxUsername}**\n\n${changes.join('\n')}\n\n*Leaderboard updated.*`,
      )],
    });

    // Refresh leaderboard in background
    refreshLeaderboard(guildId).catch((e) => logger.error('Leaderboard refresh failed:', e));

    // Log to log channel
    await discordLog('Player Modified', `**Player:** ${player.robloxUsername}\n**Changes:**\n${changes.join('\n')}\n**By:** <@${interaction.user.id}>`, 'info');
  },
};
