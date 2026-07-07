import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from './index.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embeds.js';
import { hasStaffPermission } from '../utils/permissions.js';
import { logger } from '../utils/logger.js';
import { discordLog } from '../utils/discordLogger.js';
import { Schema, model, type Document } from 'mongoose';

// Blacklist storage model — stores the user's roles
interface IBlacklist extends Document {
  guildId: string;
  discordId: string;
  roleIds: string[];
  blacklistedAt: Date;
}

const blacklistSchema = new Schema<IBlacklist>({
  guildId: { type: String, required: true },
  discordId: { type: String, required: true },
  roleIds: { type: [String], default: [] },
  blacklistedAt: { type: Date, default: () => new Date() },
});

blacklistSchema.index({ guildId: 1, discordId: 1 }, { unique: true });

const Blacklist = model<IBlacklist>('Blacklist', blacklistSchema);

// The blacklist role — gives no permissions, no channel access
const BLACKLIST_ROLE_ID = '1509128687596077056'; // We'll use a separate role, but for now this is a placeholder

export const blacklist: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Blacklist a user — removes all roles, no talk, no channel access')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to blacklist').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Is this blacklist appealable?')
        .setRequired(true)
        .addChoices(
          { name: 'Appealable', value: 'Appealable' },
          { name: 'Unappealable', value: 'Unappealable' },
        ),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Reason for blacklist').setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!hasStaffPermission(interaction.member as any)) {
      await interaction.reply({ content: 'Only staff can use this command.', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const category = interaction.options.getString('category', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    const guildId = interaction.guildId!;

    const guild = interaction.guild!;
    const member = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      await interaction.reply({ content: 'User not found in this server.', ephemeral: true });
      return;
    }

    // Check if already blacklisted
    const existing = await Blacklist.findOne({ guildId, discordId: targetUser.id });
    if (existing) {
      await interaction.reply({ content: `${targetUser.username} is already blacklisted.`, ephemeral: true });
      return;
    }

    await interaction.deferReply();

    // Store all their roles
    const roleIds = member.roles.cache.map((r) => r.id).filter((id) => id !== guild.id);

    // Store original nickname
    const originalNick = member.nickname || member.user.username;

    // Remove all roles
    try {
      await member.roles.remove(roleIds);
    } catch (error) {
      logger.error('Failed to remove roles:', error);
    }

    // Add blacklist role
    const BLACKLIST_ROLE_ID = '1523847813262479584';
    try {
      await member.roles.add(BLACKLIST_ROLE_ID);
    } catch (error) {
      logger.error('Failed to add blacklist role:', error);
    }

    // Change nickname to [BLACKLISTED]
    try {
      await member.setNickname('[BLACKLISTED]');
    } catch (error) {
      logger.error('Failed to change nickname:', error);
    }

    // Mute
    try {
      await member.disableCommunicationUntil('4102444800');
    } catch (error) {
      logger.error('Failed to mute user:', error);
    }

    // Save to DB
    await Blacklist.create({
      guildId,
      discordId: targetUser.id,
      roleIds,
    });

    // DM the user
    try {
      const dmChannel = await targetUser.createDM();
      if ('send' in dmChannel) {
        await (dmChannel as any).send({
          content: `Hey, you've been blacklisted from Ryukai.\n\n**Reason:** ${reason}\n**Category:** ${category}\n\nDM a mod to be unblacklisted.`,
        });
      }
    } catch {
      // DMs might be closed
    }

    // Announce as embed in the channel
    const { EmbedBuilder } = await import('discord.js');
    const blacklistEmbed = new EmbedBuilder()
      .setTitle('User Blacklisted')
      .setColor(0xED4245)
      .setDescription(
        `**User:** ${targetUser.username} (<@${targetUser.id}>)\n` +
        `**Category:** ${category}\n` +
        `**Reason:** ${reason}\n` +
        `**Staff:** <@${interaction.user.id}>\n` +
        `**Roles removed:** ${roleIds.length}\n` +
        `**Nickname changed to:** [BLACKLISTED]`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [blacklistEmbed] });

    await discordLog('User Blacklisted', `**User:** ${targetUser.username} (<@${targetUser.id}>)\n**Category:** ${category}\n**Reason:** ${reason}\n**Staff:** <@${interaction.user.id}>\n**Roles stored:** ${roleIds.length}`, 'warn');
    logger.info(`User blacklisted: ${targetUser.id} by ${interaction.user.id}`);
  },
};

export const unblacklist: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('unblacklist')
    .setDescription('Unblacklist a user — restores all their roles')
    .addUserOption((option) =>
      option.setName('user').setDescription('The user to unblacklist').setRequired(true),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!hasStaffPermission(interaction.member as any)) {
      await interaction.reply({ content: 'Only staff can use this command.', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const guildId = interaction.guildId!;

    const record = await Blacklist.findOne({ guildId, discordId: targetUser.id });
    if (!record) {
      await interaction.reply({ content: `${targetUser.username} is not blacklisted.`, ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const guild = interaction.guild!;
    const member = await guild.members.fetch(targetUser.id).catch(() => null);

    if (!member) {
      await interaction.editReply({ content: 'User not found in this server.' });
      return;
    }

    // Restore all roles
    let restored = 0;
    for (const roleId of record.roleIds) {
      try {
        await member.roles.add(roleId);
        restored++;
      } catch {
        // Role might not exist anymore
      }
    }

    // Remove blacklist role
    const BLACKLIST_ROLE_ID = '1523847813262479584';
    try {
      await member.roles.remove(BLACKLIST_ROLE_ID);
    } catch {}

    // Restore nickname
    try {
      await member.setNickname(null);
    } catch {}

    // Remove communication restriction
    try {
      await member.disableCommunicationUntil(null);
    } catch (error) {
      logger.error('Failed to unmute user:', error);
    }

    // Delete the blacklist record
    await Blacklist.deleteOne({ _id: record._id });

    // Announce as embed
    const { EmbedBuilder } = await import('discord.js');
    const unblacklistEmbed = new EmbedBuilder()
      .setTitle('User Unblacklisted')
      .setColor(0x57F287)
      .setDescription(
        `**User:** ${targetUser.username} (<@${targetUser.id}>)\n` +
        `**Roles restored:** ${restored}\n` +
        `**Nickname restored**\n` +
        `**Staff:** <@${interaction.user.id}>`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [unblacklistEmbed] });

    await discordLog('User Unblacklisted', `**User:** ${targetUser.username} (<@${targetUser.id}>)\n**Roles restored:** ${restored}\n**Staff:** <@${interaction.user.id}>`, 'success');
    logger.info(`User unblacklisted: ${targetUser.id} by ${interaction.user.id} — ${restored} roles restored`);
  },
};
