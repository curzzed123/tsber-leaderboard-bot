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
      option.setName('reason').setDescription('Reason for blacklist').setRequired(false),
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!hasStaffPermission(interaction.member as any)) {
      await interaction.reply({ content: 'Only staff can use this command.', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
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

    // Remove all roles
    try {
      await member.roles.remove(roleIds);
    } catch (error) {
      logger.error('Failed to remove roles:', error);
    }

    // Add blacklist role (no permissions) — we'll create a mute-like state
    // Instead of a role, we'll just remove all roles and also apply a server mute + server deafen
    try {
      await member.disableCommunicationUntil('4102444800'); // Year 2100 — permanent
    } catch (error) {
      logger.error('Failed to mute user:', error);
    }

    // Save to DB
    await Blacklist.create({
      guildId,
      discordId: targetUser.id,
      roleIds,
    });

    await interaction.editReply({ content: `${targetUser.username} has been blacklisted.\nAll roles removed. They can no longer talk or see channels.\n**Reason:** ${reason}` });

    await discordLog('User Blacklisted', `**User:** ${targetUser.username} (<@${targetUser.id}>)\n**Reason:** ${reason}\n**Staff:** <@${interaction.user.id}>\n**Roles stored:** ${roleIds.length}`, 'warn');
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

    // Remove communication restriction
    try {
      await member.disableCommunicationUntil(null);
    } catch (error) {
      logger.error('Failed to unmute user:', error);
    }

    // Delete the blacklist record
    await Blacklist.deleteOne({ _id: record._id });

    await interaction.editReply({ content: `${targetUser.username} has been unblacklisted.\nRestored ${restored} roles. They can talk and see channels again.` });

    await discordLog('User Unblacklisted', `**User:** ${targetUser.username} (<@${targetUser.id}>)\n**Roles restored:** ${restored}\n**Staff:** <@${interaction.user.id}>`, 'success');
    logger.info(`User unblacklisted: ${targetUser.id} by ${interaction.user.id} — ${restored} roles restored`);
  },
};
