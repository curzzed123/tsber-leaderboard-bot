import type { GuildMember } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { config } from '../config/index.js';

/**
 * Check if a member has staff permission.
 * Grants access if:
 * - They have the Administrator permission, OR
 * - They have one of the configured staff role IDs, OR
 * - They have one of the configured staff role IDs AND referee role (for referee commands)
 */
export function hasStaffPermission(member: GuildMember | undefined | null): boolean {
  if (!member) return false;

  // Administrator permission = automatic staff
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  // Check configured staff roles
  if (config.roles.staffRoleIds.length > 0) {
    return config.roles.staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  return false;
}

/**
 * Check if a member has referee or staff permission.
 * Grants access if:
 * - They have staff permission (see above), OR
 * - They have the configured referees role
 */
export function hasRefereePermission(member: GuildMember | undefined | null): boolean {
  if (!member) return false;

  // Staff always has referee access
  if (hasStaffPermission(member)) return true;

  // Check referee role
  if (config.roles.refereesRoleId) {
    return member.roles.cache.has(config.roles.refereesRoleId);
  }

  return false;
}
