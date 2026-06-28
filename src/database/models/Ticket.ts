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
    inactivityDeadline: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true, default: () => new Date() },
    opponentResponded: { type: Boolean, default: false },
    frozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: null },
    freezeAccumulatedMs: { type: Number, default: 0 },
    outcome: { type: String, default: null },
    closedAt: { type: Date, default: null },
    closedBy: { type: String, default: null },
    reason: { type: String, default: '' },
  },
  { timestamps: true },
);

// Index for scheduler sweeps: find open tickets by status
ticketSchema.index({ guildId: 1, status: 1 });
// Index for dodge deadline checks
ticketSchema.index({ dodgeDeadline: 1 });
// Index for inactivity deadline checks
ticketSchema.index({ inactivityDeadline: 1 });

export const Ticket = model<ITicket>('Ticket', ticketSchema);
