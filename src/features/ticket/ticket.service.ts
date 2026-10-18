import type { AppConfig } from "../../core/config.providers";
import type { UnitOfWork } from "../../core/database/database.providers";
import {
  fingerprint,
  type IIdempotencyStore,
} from "../../core/idempotency/idempotency.providers";
import type { Clock, IdGenerator } from "../../core/platform.providers";
import {
  IdempotencyKeyConflictError,
  InsufficientBalanceError,
  NotEnoughTicketsError,
  NotFoundError,
} from "../../core/errors";
import { assertPurchaseAllowed, purchaseCost } from "../raffle/raffle.rules";
import type { IRaffleRepository } from "../raffle/raffle.types";
import type { IUserRepository } from "../user/user.types";
import {
  deserialisePurchase,
  serialisePurchase,
  type ITicket,
  type ITicketRepository,
  type ITicketService,
  type PurchaseTicketsResult,
} from "./ticket.types";

export interface TicketServiceDeps {
  tickets: ITicketRepository;
  raffles: IRaffleRepository;
  users: IUserRepository;
  idempotency: IIdempotencyStore;
  unitOfWork: UnitOfWork;
  clock: Clock;
  ids: IdGenerator;
  config: AppConfig;
}

const SCOPE = "purchase_tickets";

/**
 * The whole purchase runs in one transaction. Validation reads the raffle up
 * front, but the two mutations that matter are conditional UPDATEs guarding
 * their own invariant, so a stale read cannot oversell or overdraw.
 */
export const createTicketService = ({
  tickets,
  raffles,
  users,
  idempotency,
  unitOfWork,
  clock,
  ids,
  config,
}: TicketServiceDeps): ITicketService => ({
  async purchase({ userId, raffleId, quantity, idempotencyKey }): Promise<PurchaseTicketsResult> {
    const now = clock.now();
    const requestHash = fingerprint({ raffleId, quantity });

    return unitOfWork.transaction(() => {
      const previous = idempotency.find(SCOPE, userId, idempotencyKey);
      if (previous) {
        // Replaying the wrong purchase would be worse than refusing.
        if (previous.requestHash !== requestHash) {
          throw new IdempotencyKeyConflictError(idempotencyKey);
        }
        return deserialisePurchase(previous.response);
      }

      const user = users.findById(userId);
      if (!user) throw new NotFoundError("User", userId);

      const raffle = raffles.findById(raffleId);
      if (!raffle) throw new NotFoundError("Raffle", raffleId);

      assertPurchaseAllowed(raffle, quantity, now, config.purchase.maxTicketsPerPurchase);

      const totalCost = purchaseCost(raffle, quantity);

      const ticketsSold = raffles.reserveTicketSlots(raffleId, quantity, now);
      if (ticketsSold === null) {
        throw new NotEnoughTicketsError(
          raffleId,
          quantity,
          raffle.maxTickets - raffle.ticketsSold,
        );
      }

      const remainingBalance = users.debit(userId, totalCost);
      if (remainingBalance === null) {
        throw new InsufficientBalanceError(totalCost, user.balance);
      }

      // Slots [firstNumber, ticketsSold] were just claimed by this purchase.
      const firstNumber = ticketsSold - quantity + 1;
      const paymentId = `pay_${ids.next()}`;
      const purchased: ITicket[] = Array.from({ length: quantity }, (_, offset) => ({
        id: ids.next(),
        raffleId,
        userId,
        purchasedAt: now,
        ticketNumber: firstNumber + offset,
        status: "confirmed",
        reservedUntil: null,
        paymentId,
      }));

      tickets.insertMany(purchased);

      const result: PurchaseTicketsResult = {
        tickets: purchased,
        totalCost,
        remainingBalance,
        paymentId,
        replayed: false,
      };

      // Only successful attempts are recorded: a failed purchase took no money
      // and must be genuinely retryable.
      idempotency.save(SCOPE, userId, idempotencyKey, requestHash, serialisePurchase(result), now);

      return result;
    });
  },

  async listForUser(userId) {
    return tickets.listByUser(userId);
  },
});
