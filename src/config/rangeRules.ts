import type { RangeRule } from '../types/index.js';

/**
 * Data-driven challenge range ruleset.
 * The operator can tune thresholds here without touching logic.
 *
 * Rules are evaluated in order; first match wins.
 */
export const RANGE_RULES: RangeRule[] = [
  // Top 1-10: can only challenge 1 position above
  { minRank: 1, maxRank: 10, maxAbove: 1 },

  // Top 11-12: uniquely allowed to challenge Top 9-10 (break into Top 10)
  { minRank: 11, maxRank: 12, maxAbove: 0, specialTargets: [9, 10] },

  // Top 13-60: can challenge up to 3 positions above (not into Top 10)
  { minRank: 13, maxRank: 60, maxAbove: 3 },

  // Rank 61+: can challenge up to 3 positions above
  { minRank: 61, maxRank: Infinity, maxAbove: 3 },
];

/**
 * Get the applicable range rule for a given challenger rank.
 */
export function getRangeRule(challengerRank: number): RangeRule | null {
  return RANGE_RULES.find(
    (r) => challengerRank >= r.minRank && challengerRank <= r.maxRank,
  ) ?? null;
}

/**
 * Compute the list of valid target ranks for a challenger.
 * Returns an array of rank numbers that the challenger is allowed to challenge.
 */
export function getValidTargetRanks(challengerRank: number): number[] {
  const rule = getRangeRule(challengerRank);
  if (!rule) return [];

  // Special targets take precedence (e.g., Top 11-12 → 9,10)
  if (rule.specialTargets && rule.specialTargets.length > 0) {
    return [...rule.specialTargets].sort((a, b) => a - b);
  }

  // Standard: ranks from (challengerRank - maxAbove) to (challengerRank - 1)
  const top = Math.max(1, challengerRank - rule.maxAbove);
  const targets: number[] = [];
  for (let r = top; r < challengerRank; r++) {
    targets.push(r);
  }
  return targets;
}

/**
 * Check if a challenger can challenge a specific target rank.
 */
export function canChallengeRank(challengerRank: number, targetRank: number): boolean {
  if (targetRank >= challengerRank) return false;
  if (targetRank < 1) return false;
  return getValidTargetRanks(challengerRank).includes(targetRank);
}
