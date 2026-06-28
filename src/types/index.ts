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
  [PlayerStatus.CHALLENGING]: '⚔️',
  [PlayerStatus.CHALLENGED]: '🛡️',
  [PlayerStatus.IMMUNE]: '🛡️',
  [PlayerStatus.COOLDOWN]: '⏳',
};

// ─── Button Custom IDs ───
export const ButtonCustomId = {
  CREATE_PROFILE: 'btn_create_profile',
  CHALLENGE: 'btn_challenge',
} as const;

// ─── Modal Custom IDs ───
export const ModalCustomId = {
  CREATE_PROFILE: 'modal_create_profile',
  CHALLENGE: 'modal_challenge',
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
} as const;
