import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { Player } from '../database/models/Player.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasStaffPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { refreshLeaderboard } from '../services/leaderboard.js';
import { discordLog } from '../utils/discordLogger.js';

// Tryout result channel
const TRYOUT_CHANNEL_ID = '1509295250840227860';

// Stage roles
const STAGE_ROLES: Record<string, string> = {
  'Stage 0': 'ROLE_STAGE_0',
  'Stage 1': 'ROLE_STAGE_1',
  'Stage 2': 'ROLE_STAGE_2',
};

export const result: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('result')
    .setDescription('Submit a tryout result (Tryout Host only)')
    .addUserOption((option) =>
      option.setName('user').setDescription('The player who was tried out').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('stage')
        .setDescription('Stage to assign')
        .setRequired(true)
        .addChoices(
          { name: 'Stage 0', value: 'Stage 0' },
          { name: 'Stage 1', value: 'Stage 1' },
          { name: 'Stage 2', value: 'Stage 2' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('level')
        .setDescription('Player level')
        .setRequired(true)
        .addChoices(
          { name: 'Low', value: 'Low' },
          { name: 'Mid', value: 'Mid' },
          { name: 'High', value: 'High' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('mastery')
        .setDescription('Player mastery')
        .setRequired(true)
        .addChoices(
          { name: 'Weak', value: 'Weak' },
          { name: 'Stable', value: 'Stable' },
          { name: 'Strong', value: 'Strong' },
        ),
    )
    .addStringOption((option) =>
      option.setName('notes').setDescription('Additional notes (optional)').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('pros').setDescription('Player pros (optional)').setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('cons').setDescription('Player cons (optional)').setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction | AutocompleteInteraction): Promise<void> {
    if (interaction.isAutocomplete()) {
      await interaction.respond([]);
      return;
    }

    const cmd = interaction as ChatInputCommandInteraction;

    // Only usable in the tryout result channel
    if (cmd.channelId !== TRYOUT_CHANNEL_ID) {
      await cmd.reply({ content: 'This command can only be used in the tryout result channel.', ephemeral: true });
      return;
    }

    // Only tryout hosts (staff/admin/tryout host role) can use
    const TRYOUT_HOST_ROLE_ID = '1509128687596077056';
    const member = cmd.member as any;
    const isTryoutHost = member?.roles?.cache?.has(TRYOUT_HOST_ROLE_ID) ?? false;
    if (!hasStaffPermission(member) && !isTryoutHost) {
      await cmd.reply({ content: 'Only Tryout Hosts can use this command.', ephemeral: true });
      return;
    }

    const targetUser = cmd.options.getUser('user', true);
    const stage = cmd.options.getString('stage', true);
    const level = cmd.options.getString('level', true);
    const mastery = cmd.options.getString('mastery', true);
    const notes = cmd.options.getString('notes') ?? '';
    const pros = cmd.options.getString('pros') ?? '';
    const cons = cmd.options.getString('cons') ?? '';

    // For Stage 0 and Stage 1, DM the host to confirm
    if (stage === 'Stage 0' || stage === 'Stage 1') {
      const dmChannel = await cmd.user.createDM();
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tryout_confirm:${targetUser.id}:${stage}`).setLabel(`Confirm ${stage}`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('tryout_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
      ) as any;

      const dmText =
        `**Tryout Confirmation**\n\n` +
        `**Player:** ${targetUser.username} (<@${targetUser.id}>)\n` +
        `**Stage:** ${stage}\n` +
        `**Level:** ${level}\n` +
        `**Mastery:** ${mastery}\n\n` +
        `Are you sure you want to give ${targetUser.username} **${stage}**?`;

      if ('send' in dmChannel) {
        await (dmChannel as any).send({ content: dmText, components: [confirmRow] });
      }

      await cmd.reply({ content: `Confirmation sent to your DMs for ${stage}. The result will be posted once confirmed.`, ephemeral: true });

      // Store pending result for when they confirm
      (globalThis as any).pendingTryout = {
        userId: targetUser.id,
        username: targetUser.username,
        stage,
        level,
        mastery,
        notes,
        pros,
        cons,
        hostId: cmd.user.id,
        hostTag: cmd.user.tag,
      };
      return;
    }

    // Stage 2 — post directly
    await postResult(cmd, targetUser, stage, level, mastery, notes, pros, cons);
  },
};

async function postResult(
  cmd: ChatInputCommandInteraction,
  targetUser: any,
  stage: string,
  level: string,
  mastery: string,
  notes: string,
  pros: string,
  cons: string,
) {
  // Post result in the tryout channel
  let resultText =
    `**Tryout Result**\n\n` +
    `**Player:** <@${targetUser.id}>\n` +
    `**Stage:** ${stage}\n` +
    `**Level:** ${level}\n` +
    `**Mastery:** ${mastery}`;

  if (notes) resultText += `\n\n**Notes:** ${notes}`;
  if (pros) resultText += `\n**Pros:** ${pros}`;
  if (cons) resultText += `\n**Cons:** ${cons}`;

  resultText += `\n\n**Host:** <@${cmd.user.id}>`;

  await cmd.reply({ content: resultText });

  // Update player's stage in DB if they exist
  const player = await Player.findOne({ guildId: cmd.guildId!, discordId: targetUser.id });
  if (player) {
    player.stage = stage;
    await player.save();
    refreshLeaderboard(cmd.guildId!).catch(() => {});
  }

  // Log
  await discordLog('Tryout Result', `**Player:** ${targetUser.username}\n**Stage:** ${stage}\n**Level:** ${level}\n**Mastery:** ${mastery}\n**Host:** <@${cmd.user.id}>`, 'info');
  logger.info(`Tryout result: ${targetUser.username} — ${stage} by ${cmd.user.id}`);
}
