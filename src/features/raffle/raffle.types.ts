import { t } from "elysia";
import type { IPrize, IRaffle, RaffleStatus } from "../../../interfaces";

export type { IPrize, IRaffle, RaffleStatus };

export interface IRaffleRepository {
  findById(id: string): IRaffle | null;
  /** Omit `status` to list every raffle. */
  list(status?: RaffleStatus): IRaffle[];
  findDueForDraw(now: Date): IRaffle[];
  /**
   * Claims `quantity` slots and returns the new `ticketsSold`, or `null` if
   * the raffle is no longer active or has too few left. The guard is in the
   * WHERE clause, so concurrent purchases cannot oversell.
   */
  reserveTicketSlots(raffleId: string, quantity: number, now: Date): number | null;
  /** False if the raffle was already drawn. */
  markDrawn(raffleId: string, winningTicketId: string, now: Date): boolean;
  markClosed(raffleId: string, now: Date): boolean;
}

export interface IRaffleService {
  list(status?: RaffleStatus): Promise<IRaffle[]>;
  getById(id: string): Promise<IRaffle>;
}

export interface PrizeView {
  id: string;
  name: string;
  description: string;
  value: number;
  imageUrl: string | null;
}

export interface RaffleView {
  id: string;
  name: string;
  description: string;
  prize: PrizeView;
  ticketPrice: number;
  maxTickets: number;
  ticketsSold: number;
  ticketsRemaining: number;
  drawDate: string;
  status: RaffleStatus;
  winningTicketId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const toRaffleView = (raffle: IRaffle): RaffleView => ({
  id: raffle.id,
  name: raffle.name,
  description: raffle.description,
  prize: { ...raffle.prize },
  ticketPrice: raffle.ticketPrice,
  maxTickets: raffle.maxTickets,
  ticketsSold: raffle.ticketsSold,
  ticketsRemaining: raffle.maxTickets - raffle.ticketsSold,
  drawDate: raffle.drawDate.toISOString(),
  status: raffle.status,
  winningTicketId: raffle.winningTicketId,
  createdAt: raffle.createdAt.toISOString(),
  updatedAt: raffle.updatedAt.toISOString(),
});

// --- HTTP schemas -----------------------------------------------------------

export const RaffleStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("active"),
  t.Literal("closed"),
  t.Literal("drawn"),
  t.Literal("cancelled"),
]);

const PrizeViewSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.String(),
  value: t.Integer({ description: "Retail value in cents" }),
  imageUrl: t.Nullable(t.String()),
});

export const RaffleViewSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.String(),
  prize: PrizeViewSchema,
  ticketPrice: t.Integer({ description: "Price per ticket in cents" }),
  maxTickets: t.Integer(),
  ticketsSold: t.Integer(),
  ticketsRemaining: t.Integer(),
  drawDate: t.String({ format: "date-time" }),
  status: RaffleStatusSchema,
  winningTicketId: t.Nullable(t.String()),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});
