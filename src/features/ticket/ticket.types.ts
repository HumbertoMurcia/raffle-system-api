import { t } from "elysia";
import type { ITicket, TicketStatus } from "../../../interfaces";

export type { ITicket, TicketStatus };

export interface ITicketRepository {
  insertMany(tickets: readonly ITicket[]): void;
  findById(id: string): ITicket | null;
  listByUser(userId: string): ITicket[];
  /** The pool the draw selects from. */
  listConfirmedByRaffle(raffleId: string): ITicket[];
}

export interface PurchaseTicketsCommand {
  userId: string;
  raffleId: string;
  quantity: number;
  /** Required: a client that times out has no other way to retry safely. */
  idempotencyKey: string;
}

export interface PurchaseTicketsResult {
  tickets: ITicket[];
  totalCost: number;
  remainingBalance: number;
  paymentId: string;
  /** True when this response replays an earlier attempt rather than charging. */
  replayed: boolean;
}

/** Stored form of a purchase; dates are revived on replay. */
interface StoredPurchase {
  tickets: TicketView[];
  totalCost: number;
  remainingBalance: number;
  paymentId: string;
}

export const serialisePurchase = (result: PurchaseTicketsResult): string =>
  JSON.stringify({
    tickets: result.tickets.map(toTicketView),
    totalCost: result.totalCost,
    remainingBalance: result.remainingBalance,
    paymentId: result.paymentId,
  } satisfies StoredPurchase);

export const deserialisePurchase = (raw: string): PurchaseTicketsResult => {
  const stored = JSON.parse(raw) as StoredPurchase;
  return {
    tickets: stored.tickets.map((ticket) => ({
      id: ticket.id,
      raffleId: ticket.raffleId,
      userId: ticket.userId,
      purchasedAt: new Date(ticket.purchasedAt),
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      reservedUntil: ticket.reservedUntil ? new Date(ticket.reservedUntil) : null,
      paymentId: ticket.paymentId,
    })),
    totalCost: stored.totalCost,
    remainingBalance: stored.remainingBalance,
    paymentId: stored.paymentId,
    replayed: true,
  };
};

export interface ITicketService {
  purchase(command: PurchaseTicketsCommand): Promise<PurchaseTicketsResult>;
  listForUser(userId: string): Promise<ITicket[]>;
}

export interface TicketView {
  id: string;
  raffleId: string;
  userId: string;
  ticketNumber: number;
  status: TicketStatus;
  purchasedAt: string;
  reservedUntil: string | null;
  paymentId: string | null;
}

export const toTicketView = (ticket: ITicket): TicketView => ({
  id: ticket.id,
  raffleId: ticket.raffleId,
  userId: ticket.userId,
  ticketNumber: ticket.ticketNumber,
  status: ticket.status,
  purchasedAt: ticket.purchasedAt.toISOString(),
  reservedUntil: ticket.reservedUntil?.toISOString() ?? null,
  paymentId: ticket.paymentId,
});

// --- HTTP schemas -----------------------------------------------------------

export const TicketViewSchema = t.Object({
  id: t.String(),
  raffleId: t.String(),
  userId: t.String(),
  ticketNumber: t.Integer(),
  status: t.Union([
    t.Literal("reserved"),
    t.Literal("confirmed"),
    t.Literal("expired"),
    t.Literal("refunded"),
  ]),
  purchasedAt: t.String({ format: "date-time" }),
  reservedUntil: t.Nullable(t.String({ format: "date-time" })),
  paymentId: t.Nullable(t.String()),
});

export const PurchaseTicketsBodySchema = t.Object({
  quantity: t.Integer({ minimum: 1, default: 1 }),
});

export const PurchaseTicketsHeadersSchema = t.Object({
  "idempotency-key": t.String({
    minLength: 8,
    maxLength: 255,
    description:
      "Unique per purchase attempt. Retrying with the same key replays the original result instead of charging again.",
  }),
});

export const PurchaseTicketsResultSchema = t.Object({
  tickets: t.Array(TicketViewSchema),
  totalCost: t.Integer(),
  remainingBalance: t.Integer(),
  paymentId: t.String(),
  replayed: t.Boolean(),
});
