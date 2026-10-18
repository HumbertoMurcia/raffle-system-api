import { NotFoundError } from "../../core/errors";
import type { UnitOfWork } from "../../core/database/database.providers";
import type { Clock, RandomSource } from "../../core/platform.providers";
import { isDueForDraw } from "../raffle/raffle.rules";
import type { IRaffleRepository } from "../raffle/raffle.types";
import type { ITicketRepository } from "../ticket/ticket.types";
import type { DrawResult, IDrawService } from "./draw.types";

export interface DrawServiceDeps {
  raffles: IRaffleRepository;
  tickets: ITicketRepository;
  unitOfWork: UnitOfWork;
  clock: Clock;
  random: RandomSource;
}

const skipped = (raffleId: string): DrawResult => ({
  raffleId,
  outcome: "skipped",
  winningTicketId: null,
  winnerUserId: null,
});

/**
 * Idempotent by construction: the winner is written with an UPDATE that only
 * matches a still-`active` raffle, so an overlapping run cannot overwrite one.
 */
export const createDrawService = ({
  raffles,
  tickets,
  unitOfWork,
  clock,
  random,
}: DrawServiceDeps): IDrawService => {
  const drawOne = (raffleId: string): DrawResult =>
    unitOfWork.transaction(() => {
      // Re-read inside the transaction: the queue may be stale by now.
      const raffle = raffles.findById(raffleId);
      if (!raffle) throw new NotFoundError("Raffle", raffleId);
      if (!isDueForDraw(raffle, clock.now())) return skipped(raffleId);

      const entries = tickets.listConfirmedByRaffle(raffleId);
      const now = clock.now();

      if (entries.length === 0) {
        raffles.markClosed(raffleId, now);
        return {
          raffleId,
          outcome: "closed_no_entries",
          winningTicketId: null,
          winnerUserId: null,
        };
      }

      const winner = entries[random.int(entries.length)];
      if (!winner) return skipped(raffleId);

      if (!raffles.markDrawn(raffleId, winner.id, now)) return skipped(raffleId);

      return {
        raffleId,
        outcome: "drawn",
        winningTicketId: winner.id,
        winnerUserId: winner.userId,
      };
    });

  return {
    async runDueDraws() {
      return raffles
        .findDueForDraw(clock.now())
        .map((raffle) => drawOne(raffle.id));
    },

    async drawRaffle(raffleId) {
      return drawOne(raffleId);
    },
  };
};
