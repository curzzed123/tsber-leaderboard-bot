import { Schema, model, type Document, type Types } from 'mongoose';
import { PlayerStatus, Region } from '../../types/index.js';

export interface OpponentLockout {
  opponentDiscordId: string;
  until: Date;
}

export interface LeaveOfAbsence {
  approved: boolean;
  until: Date | null;
  reason: string;
}

export interface IPlayer extends Document {
  guildId: string;
  discordId: string;
  discordUsername: string;
  robloxId: number;
  robloxUsername: string;
  robloxHeadshotUrl: string;
  robloxHeadshotExpiresAt: Date;
  customHeadshotUrl: string | null; // User-uploaded profile picture
  rank: number | null;
  stage: string;
  region: (typeof Region)[keyof typeof Region];
  wins: number;
  losses: number;
  streak: number;
  status: (typeof PlayerStatus)[keyof typeof PlayerStatus];
  cooldownUntil: Date | null;
  immunityUntil: Date | null;
  activeTicketId: Types.ObjectId | null;
  opponentLockouts: OpponentLockout[];
  loa: LeaveOfAbsence;
  createdAt: Date;
  updatedAt: Date;
}

const opponentLockoutSchema = new Schema<OpponentLockout>(
  {
    opponentDiscordId: { type: String, required: true },
    until: { type: Date, required: true },
  },
  { _id: false },
);

const loaSchema = new Schema<LeaveOfAbsence>(
  {
    approved: { type: Boolean, default: false },
    until: { type: Date, default: null },
    reason: { type: String, default: '' },
  },
  { _id: false },
);

const playerSchema = new Schema<IPlayer>(
  {
    guildId: { type: String, required: true, index: true },
    discordId: { type: String, required: true },
    discordUsername: { type: String, default: '' },
    robloxId: { type: Number, required: true },
    robloxUsername: { type: String, required: true },
    robloxHeadshotUrl: { type: String, default: '' },
    robloxHeadshotExpiresAt: { type: Date, default: () => new Date() },
    customHeadshotUrl: { type: String, default: null },
    rank: { type: Number, default: null },
    stage: { type: String, default: 'Stage 0' },
    region: {
      type: String,
      enum: Object.values(Region),
      default: Region.NA,
    },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(PlayerStatus),
      default: PlayerStatus.IDLE,
    },
    cooldownUntil: { type: Date, default: null },
    immunityUntil: { type: Date, default: null },
    activeTicketId: { type: Schema.Types.ObjectId, ref: 'Ticket', default: null },
    opponentLockouts: { type: [opponentLockoutSchema], default: [] },
    loa: { type: loaSchema, default: () => ({}) },
  },
  { timestamps: true },
);

// Compound unique index: one player per guild per Discord user
playerSchema.index({ guildId: 1, discordId: 1 }, { unique: true });
// Index for: rank-based queries (leaderboard sorting, range checks)
playerSchema.index({ guildId: 1, rank: 1 });

export const Player = model<IPlayer>('Player', playerSchema);
