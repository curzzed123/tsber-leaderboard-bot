import { Schema, model, type Document } from 'mongoose';
import { TicketStatus } from '../../types/index.js';

export interface ITicket extends Document {
  guildId: string;
  channelId: string;
  challengerDiscordId: string;
  opponentDiscordId: string;
  status: (typeof TicketStatus)[keyof typeof TicketStatus];
  createdAt: Date;
  dodgeDeadline: Date;
  inactivityDeadline: Date;
  lastActivityAt: Date;
  opponentResponded: boolean;
  frozen: boolean;
  frozenAt: Date | null;
  freezeAccumulatedMs: number;
  outcome: string | null;
  closedAt: Date | null;
  closedBy: string | null;
  reason: string;
  fightTime: Date | null;
  fightType: string | null;
  fightAnnounced: boolean;
  fightOpened: boolean;
  claimedBy: string | null;
  firstChannelClosed: boolean;
  fightChannelId: string | null;
  updatedAt: Date;
}

const ticketSchema = new Schema<ITicket>(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, required: true },
    challengerDiscordId: { type: String, required: true },
    opponentDiscordId: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(TicketStatus),
      default: TicketStatus.OPEN,
    },
    dodgeDeadline: { type: Date, required: true },
    inactivityDeadline: { type: Date, required: true, default: () => new Date() },
    lastActivityAt: { type: Date, required: true, default: () => new Date() },
    opponentResponded: { type: Boolean, default: false },
    frozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: null },
    freezeAccumulatedMs: { type: Number, default: 0 },
    outcome: { type: String, default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: null },
    reason: { type: String, default: '' },
    fightTime: { type: Date, default: null },
    fightType: { type: String, default: null },
    fightAnnounced: { type: Boolean, default: false },
    fightOpened: { type: Boolean, default: false },
    claimedBy: { type: String, default: null },
    firstChannelClosed: { type: Boolean, default: false },
    fightChannelId: { type: String, default: null },
  },
  { timestamps: true },
);

ticketSchema.index({ guildId: 1, status: 1 });
ticketSchema.index({ dodgeDeadline: 1 });
ticketSchema.index({ inactivityDeadline: 1 });
ticketSchema.index({ fightTime: 1 });

export const Ticket = model<ITicket>('Ticket', ticketSchema);
