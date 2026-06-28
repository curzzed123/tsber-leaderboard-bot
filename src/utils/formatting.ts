import { PlayerStatus, STATUS_EMOJI } from '../types/index.js';

/**
 * Format a player's status as an emoji indicator.
 */
export function getStatusEmoji(status: PlayerStatus): string {
  return STATUS_EMOJI[status] ?? '';
}

/**
 * Format rank for display: "Unranked" for null, "#N" for ranked.
 */
export function formatRank(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return 'Unranked';
  return `#${rank}`;
}

/**
 * Format a player's W/L record.
 */
export function formatRecord(wins: number, losses: number): string {
  return `${wins}W / ${losses}L`;
}

/**
 * Format a player's streak for display.
 */
export function formatStreak(streak: number): string {
  if (streak > 0) return `🔥 ${streak}W streak`;
  if (streak < 0) return `💀 ${Math.abs(streak)}L streak`;
  return '—';
}

/**
 * Format a player's display name with status emoji.
 */
export function formatPlayerDisplay(
  robloxUsername: string,
  rank: number | null,
  status: PlayerStatus,
): string {
  const emoji = getStatusEmoji(status);
  const rankStr = formatRank(rank);
  return `${emoji} **${rankStr}** — ${robloxUsername}`;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Format a Date as a relative time string (Discord timestamp).
 */
export function discordTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

/**
 * Format a Date as a Discord timestamp with full date/time.
 */
export function discordTimestampFull(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}
