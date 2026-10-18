import { describe, expect, test } from "bun:test";
import {
  InvalidPurchaseQuantityError,
  NotEnoughTicketsError,
  RaffleDrawDatePassedError,
  RaffleNotActiveError,
} from "../src/core/errors";
import {
  assertPurchaseAllowed,
  isDueForDraw,
  isOpenForPurchase,
  purchaseCost,
  ticketsRemaining,
} from "../src/features/raffle/raffle.rules";
import { makeRaffle } from "./helpers/in-memory-repositories";

const NOW = new Date("2026-01-15T12:00:00.000Z");
const LATER = new Date("2026-02-01T00:00:00.000Z");
const EARLIER = new Date("2026-01-01T00:00:00.000Z");

describe("raffle domain rules", () => {
  describe("a raffle only sells tickets while it is active", () => {
    test("an active raffle with a future draw date is open", () => {
      expect(isOpenForPurchase(makeRaffle({ drawDate: LATER }), NOW)).toBe(true);
    });

    // The whole point of the status field: everything that is not `active`
    // must refuse sales, whatever the dates say.
    test.each(["draft", "closed", "drawn", "cancelled"] as const)(
      "a %s raffle is closed to purchases",
      (status) => {
        const raffle = makeRaffle({ status, drawDate: LATER });
        expect(isOpenForPurchase(raffle, NOW)).toBe(false);
        expect(() => assertPurchaseAllowed(raffle, 1, NOW, 20)).toThrow(RaffleNotActiveError);
      },
    );

    test("sales stop once the draw date has arrived, even while active", () => {
      const raffle = makeRaffle({ drawDate: EARLIER });
      expect(isOpenForPurchase(raffle, NOW)).toBe(false);
      expect(() => assertPurchaseAllowed(raffle, 1, NOW, 20)).toThrow(RaffleDrawDatePassedError);
    });
  });

  describe("a raffle cannot oversell", () => {
    test("remaining capacity is max minus sold", () => {
      expect(ticketsRemaining(makeRaffle({ maxTickets: 10, ticketsSold: 4 }))).toBe(6);
    });

    test("buying more than remains is rejected and names the shortfall", () => {
      const raffle = makeRaffle({ maxTickets: 10, ticketsSold: 8, drawDate: LATER });
      expect(() => assertPurchaseAllowed(raffle, 3, NOW, 20)).toThrow(NotEnoughTicketsError);
      expect(() => assertPurchaseAllowed(raffle, 2, NOW, 20)).not.toThrow();
    });
  });

  describe("purchase quantity is bounded", () => {
    test.each([0, -1, 1.5])("rejects a quantity of %p", (quantity) => {
      const raffle = makeRaffle({ drawDate: LATER });
      expect(() => assertPurchaseAllowed(raffle, quantity, NOW, 20)).toThrow(
        InvalidPurchaseQuantityError,
      );
    });

    test("rejects more than the per-purchase cap", () => {
      const raffle = makeRaffle({ maxTickets: 100, drawDate: LATER });
      expect(() => assertPurchaseAllowed(raffle, 21, NOW, 20)).toThrow(
        InvalidPurchaseQuantityError,
      );
    });
  });

  test("cost is price times quantity, in cents", () => {
    expect(purchaseCost(makeRaffle({ ticketPrice: 250 }), 4)).toBe(1_000);
  });

  describe("a raffle becomes drawable at its draw date", () => {
    test("active and past the draw date is due", () => {
      expect(isDueForDraw(makeRaffle({ drawDate: EARLIER }), NOW)).toBe(true);
    });

    test("active but before the draw date is not due", () => {
      expect(isDueForDraw(makeRaffle({ drawDate: LATER }), NOW)).toBe(false);
    });

    // Guards against a second draw overwriting a recorded winner.
    test("an already drawn raffle is never due again", () => {
      const raffle = makeRaffle({ drawDate: EARLIER, status: "drawn" });
      expect(isDueForDraw(raffle, NOW)).toBe(false);
    });
  });
});
