import type { GuildMember } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';

/**
 * Check if a member has staff permission.
 * Staff = anyone with Administrator permission.
 */
export function hasStaffPermission(member: GuildMember | undefined | null): boolean {
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Check if a member has referee or staff permission.
 * Staff = Administrator permission.
 * Referee = has the referees role (hardcoded ID).
 */
const REFEREES_ROLE_ID = '1520869356903600369';

export function hasRefereePermission(member: GuildMember | undefined | null): boolean {
  if (!member) return false;
  if (hasStaffPermission(member)) return true;
  return member.roles.cache.has(REFEREES_ROLE_ID);
}
