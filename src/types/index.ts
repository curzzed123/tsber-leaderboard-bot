// ─── Player Status ───
export enum PlayerStatus {
  IDLE = 'IDLE',
  CHALLENGING = 'CHALLENGING',
  CHALLENGED = 'CHALLENGED',
  IMMUNE = 'IMMUNE',
  COOLDOWN = 'COOLDOWN',
}

// ─── Ticket Status ───
export enum TicketStatus {
  OPEN = 'OPEN',
  FROZEN = 'FROZEN',
  CLOSED_WIN_CHALLENGER = 'CLOSED_WIN_CHALLENGER',
  CLOSED_WIN_OPPONENT = 'CLOSED_WIN_OPPONENT',
  CLOSED_INVALID = 'CLOSED_INVALID',
  CLOSED_STAFF = 'CLOSED_STAFF',
}

// ─── Region ───
export enum Region {
  EU = 'EU',
  AS = 'AS',
  NA = 'NA',
}

// ─── Match Outcome ───
export type MatchOutcome =
  | 'WIN_CHALLENGER'
  | 'WIN_OPPONENT'
  | 'INVALID';

// ─── Challenge Range Rule ───
export interface RangeRule {
  minRank: number;
  maxRank: number;
  maxAbove: number;
  specialTargets?: number[];
}

// ─── Challenge Validation Result ───
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// ─── Player Status Emoji Mapping ───
export const STATUS_EMOJI: Record<PlayerStatus, string> = {
  [PlayerStatus.IDLE]: '',
  [PlayerStatus.CHALLENGING]: '',
  [PlayerStatus.CHALLENGED]: '',
  [PlayerStatus.IMMUNE]: '',
  [PlayerStatus.COOLDOWN]: '',
};

// ─── Button Custom IDs ───
export const ButtonCustomId = {
  CREATE_PROFILE: 'btn_create_profile',
  CHALLENGE: 'btn_challenge',
  APPLY_LEADERBOARD: 'btn_apply_leaderboard',
  CLAIM_TICKET: 'btn_claim_ticket',
  CLOSE_TICKET: 'btn_close_ticket',
  DM_WIN_CHALLENGER: 'dm_win_challenger',
  DM_WIN_OPPONENT: 'dm_win_opponent',
  DM_INVALID: 'dm_invalid',
  TRYOUT_CONFIRM: 'tryout_confirm',
  TRYOUT_CANCEL: 'tryout_cancel',
  GENERAL_SUPPORT: 'btn_general_support',
} as const;

// ─── Modal Custom IDs ───
export const ModalCustomId = {
  CREATE_PROFILE: 'modal_create_profile',
  CHALLENGE: 'modal_challenge',
  APPLY_LEADERBOARD: 'modal_apply_leaderboard',
  CLAIM_TICKET: 'modal_claim_ticket',
  DM_SCORE: 'modal_dm_score',
  GENERAL_SUPPORT: 'modal_general_support',
} as const;

// ─── Select Custom IDs ───
export const SelectCustomId = {
  CHALLENGE_OPPONENT: 'select_challenge_opponent',
} as const;

// ─── Modal Input Custom IDs ───
export const ModalInputCustomId = {
  ROBLOX_USERNAME: 'input_roblox_username',
  REGION: 'input_region',
  OPPONENT_USERNAME: 'input_opponent_username',
  CUSTOM_HEADSHOT_URL: 'input_custom_headshot_url',
  APPLY_ROBLOX_USERNAME: 'input_apply_roblox_username',
  APPLY_REGION: 'input_apply_region',
  APPLY_EXPERIENCE: 'input_apply_experience',
  CLAIM_FIGHT_TIME: 'input_claim_fight_time',
  CLAIM_FIGHT_TYPE: 'input_claim_fight_type',
  CLAIM_AM_PM: 'input_claim_ampm',
  CLAIM_COUNTRY: 'input_claim_country',
  DM_SCORE: 'input_dm_score',
  SUPPORT_REASON: 'input_support_reason',
  SUPPORT_DETAILS: 'input_support_details',
} as const;
