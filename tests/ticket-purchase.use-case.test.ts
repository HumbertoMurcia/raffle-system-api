/**
 * Only `TicketModule` is booted, with every dependency it declares replaced
 * via `createApplication`'s `providers` override. The service under test is
 * the real one; there is no database, clock or HTTP involved.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { createApplication, provide } from "difunkt";
import { APP_CONFIG } from "../src/core/config.providers";
import { UNIT_OF_WORK } from "../src/core/database/database.providers";
import { CLOCK, ID_GENERATOR } from "../src/core/platform.providers";
import {
  IdempotencyKeyConflictError,
  InsufficientBalanceError,
  NotEnoughTicketsError,
  NotFoundError,
  RaffleNotActiveError,
} from "../src/core/errors";
import { IDEMPOTENCY_STORE } from "../src/core/idempotency/idempotency.providers";
import { RAFFLE_REPOSITORY } from "../src/features/raffle/raffle.providers";
import type { IRaffle, IRaffleRepository } from "../src/features/raffle/raffle.types";
import { TICKET_REPOSITORY, TICKET_SERVICE } from "../src/features/ticket/ticket.providers";
import { TicketModule } from "../src/features/ticket/ticket.module";
import { USER_REPOSITORY } from "../src/features/user/user.providers";
import {
  fixedClock,
  createSequentialIds,
  passthroughUnitOfWork,
  testConfig,
} from "./helpers/fakes";
import {
  createInMemoryIdempotencyStore,
  createInMemoryRaffleRepository,
  type InMemoryRaffleRepository,
  createInMemoryTicketRepository,
  createInMemoryUserRepository,
  makeRaffle,
  makeUser,
} from "./helpers/in-memory-repositories";

const NOW = new Date("2026-01-15T12:00:00.000Z");
const FUTURE = new Date("2026-02-01T00:00:00.000Z");
const PAST = new Date("2026-01-01T00:00:00.000Z");

interface HarnessOptions {
  seedRaffles?: IRaffle[];
  /** Wraps the in-memory repository to simulate a hostile storage layer. */
  raffleRepository?: (base: InMemoryRaffleRepository) => IRaffleRepository;
  balance?: number;
  maxTicketsPerPurchase?: number;
}

const buildHarness = async (options: HarnessOptions = {}) => {
  const users = createInMemoryUserRepository([
    makeUser({ id: "usr_1", balance: options.balance ?? 10_000 }),
  ]);
  const raffles = createInMemoryRaffleRepository(
    options.seedRaffles ?? [
      makeRaffle({ id: "raf_1", ticketPrice: 500, maxTickets: 10, drawDate: FUTURE }),
    ],
  );
  const raffleRepository = options.raffleRepository?.(raffles) ?? raffles;
  const tickets = createInMemoryTicketRepository();
  const idempotency = createInMemoryIdempotencyStore();

  const resolve = await createApplication(TicketModule, {
    providers: [
      provide(APP_CONFIG, {
        value: testConfig({
          purchase: { maxTicketsPerPurchase: options.maxTicketsPerPurchase ?? 20 },
        }),
      }),
      provide(UNIT_OF_WORK, { value: passthroughUnitOfWork }),
      provide(CLOCK, { value: fixedClock(NOW) }),
      provide(ID_GENERATOR, { value: createSequentialIds("tkt") }),
      provide(USER_REPOSITORY, { value: users }),
      provide(RAFFLE_REPOSITORY, { value: raffleRepository }),
      provide(TICKET_REPOSITORY, { value: tickets }),
      provide(IDEMPOTENCY_STORE, { value: idempotency }),
    ],
  });

  const service = resolve(TICKET_SERVICE);

  /** Fresh idempotency key per call unless the test pins one. */
  let keyCounter = 0;
  const buy = (
    command: { userId: string; raffleId: string; quantity: number },
    idempotencyKey = `key-${++keyCounter}-aaaaaaaa`,
  ) => service.purchase({ ...command, idempotencyKey });

  return { service, buy, users, raffles, tickets, idempotency };
};

describe("purchase tickets use case", () => {
  let harness: Awaited<ReturnType<typeof buildHarness>>;

  beforeEach(async () => {
    harness = await buildHarness();
  });

  test("issues the requested tickets, numbered sequentially per raffle", async () => {
    const result = await harness.buy({
      userId: "usr_1",
      raffleId: "raf_1",
      quantity: 3,
    });

    expect(result.tickets).toHaveLength(3);
    expect(result.tickets.map((ticket) => ticket.ticketNumber)).toEqual([1, 2, 3]);
    expect(result.tickets.every((ticket) => ticket.status === "confirmed")).toBe(true);
    // One purchase is one payment, so the tickets share a payment id.
    expect(new Set(result.tickets.map((ticket) => ticket.paymentId)).size).toBe(1);
    expect(harness.tickets.tickets).toHaveLength(3);
  });

  test("charges price x quantity and returns the remaining balance", async () => {
    const result = await harness.buy({
      userId: "usr_1",
      raffleId: "raf_1",
      quantity: 4,
    });

    expect(result.totalCost).toBe(2_000);
    expect(result.remainingBalance).toBe(8_000);
    expect(harness.users.users.get("usr_1")?.balance).toBe(8_000);
  });

  test("a second purchase continues the raffle's ticket numbering", async () => {
    await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 2 });
    const second = await harness.buy({
      userId: "usr_1",
      raffleId: "raf_1",
      quantity: 2,
    });

    expect(second.tickets.map((ticket) => ticket.ticketNumber)).toEqual([3, 4]);
  });

  describe("validation", () => {
    test("rejects a raffle that is not active, and sells nothing", async () => {
      const harness = await buildHarness({
        seedRaffles: [makeRaffle({ id: "raf_1", status: "draft", drawDate: FUTURE })],
      });

      await expect(
        harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }),
      ).rejects.toThrow(RaffleNotActiveError);
      expect(harness.tickets.tickets).toHaveLength(0);
      expect(harness.users.users.get("usr_1")?.balance).toBe(10_000);
    });

    test("rejects a raffle whose draw date has passed", async () => {
      const harness = await buildHarness({
        seedRaffles: [makeRaffle({ id: "raf_1", drawDate: PAST })],
      });

      await expect(
        harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }),
      ).rejects.toThrow("closed for sales");
    });

    test("rejects a purchase the balance cannot cover, leaving no tickets behind", async () => {
      const harness = await buildHarness({ balance: 999 });

      await expect(
        harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 2 }),
      ).rejects.toThrow(InsufficientBalanceError);
      expect(harness.tickets.tickets).toHaveLength(0);
      expect(harness.users.users.get("usr_1")?.balance).toBe(999);
    });

    test("rejects more tickets than the raffle has left", async () => {
      const harness = await buildHarness({
        seedRaffles: [
          makeRaffle({ id: "raf_1", maxTickets: 10, ticketsSold: 9, drawDate: FUTURE }),
        ],
      });

      await expect(
        harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 2 }),
      ).rejects.toThrow(NotEnoughTicketsError);
    });

    test("honours the per-purchase cap from injected configuration", async () => {
      const harness = await buildHarness({ maxTicketsPerPurchase: 2 });

      await expect(
        harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 3 }),
      ).rejects.toThrow("Quantity must be between 1 and 2");
    });

    test.each([
      ["unknown user", { userId: "usr_missing", raffleId: "raf_1" }],
      ["unknown raffle", { userId: "usr_1", raffleId: "raf_missing" }],
    ])("rejects an %s", async (_label, command) => {
      await expect(harness.buy({ ...command, quantity: 1 })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  test("a slot reservation lost to a concurrent buyer fails the purchase", async () => {
    // The raffle looked available when read, but the conditional UPDATE
    // matched no rows.
    const harness = await buildHarness({
      seedRaffles: [makeRaffle({ id: "raf_1", maxTickets: 10, drawDate: FUTURE })],
      raffleRepository: (base) => ({ ...base, reserveTicketSlots: () => null }),
    });

    await expect(
      harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }),
    ).rejects.toThrow(NotEnoughTicketsError);
    expect(harness.tickets.tickets).toHaveLength(0);
  });

  describe("retrying a purchase", () => {
    const KEY = "retry-key-0001";

    test("the same key replays the original result instead of charging twice", async () => {
      const first = await harness.buy(
        { userId: "usr_1", raffleId: "raf_1", quantity: 2 },
        KEY,
      );
      const retry = await harness.buy(
        { userId: "usr_1", raffleId: "raf_1", quantity: 2 },
        KEY,
      );

      expect(first.replayed).toBe(false);
      expect(retry.replayed).toBe(true);
      // Same tickets, same payment, not a second set.
      expect(retry.tickets.map((ticket) => ticket.id)).toEqual(
        first.tickets.map((ticket) => ticket.id),
      );
      expect(retry.paymentId).toBe(first.paymentId);
      expect(retry.remainingBalance).toBe(first.remainingBalance);

      // Nothing was sold or charged the second time.
      expect(harness.tickets.tickets).toHaveLength(2);
      expect(harness.users.users.get("usr_1")?.balance).toBe(9_000);
      expect(harness.raffles.raffles.get("raf_1")?.ticketsSold).toBe(2);
    });

    test("a replayed result revives dates, not just strings", async () => {
      const first = await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }, KEY);
      const retry = await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }, KEY);

      expect(retry.tickets[0]?.purchasedAt).toBeInstanceOf(Date);
      expect(retry.tickets[0]?.purchasedAt.toISOString()).toBe(
        first.tickets[0]!.purchasedAt.toISOString(),
      );
    });

    test("a deliberate second purchase with a fresh key is still charged", async () => {
      await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }, "key-aaaaaaaa");
      await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }, "key-bbbbbbbb");

      expect(harness.tickets.tickets).toHaveLength(2);
      expect(harness.users.users.get("usr_1")?.balance).toBe(9_000);
    });

    test("reusing a key for a different request is refused, not silently replayed", async () => {
      await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 2 }, KEY);

      await expect(
        harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 5 }, KEY),
      ).rejects.toThrow(IdempotencyKeyConflictError);
      // The original purchase is untouched.
      expect(harness.tickets.tickets).toHaveLength(2);
    });

    // A failed attempt took no money, so the retry must be a real attempt.
    test("a failed attempt is not recorded against the key", async () => {
      const harness = await buildHarness({ balance: 400 });

      await expect(
        harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }, KEY),
      ).rejects.toThrow(InsufficientBalanceError);

      harness.users.users.get("usr_1")!.balance = 5_000;
      const retry = await harness.buy(
        { userId: "usr_1", raffleId: "raf_1", quantity: 1 },
        KEY,
      );

      expect(retry.replayed).toBe(false);
      expect(retry.tickets).toHaveLength(1);
    });

    test("keys are scoped per user, so one buyer cannot replay another's", async () => {
      harness.users.users.set("usr_2", makeUser({ id: "usr_2", email: "two@example.com" }));

      const one = await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }, KEY);
      const two = await harness.buy({ userId: "usr_2", raffleId: "raf_1", quantity: 1 }, KEY);

      expect(two.replayed).toBe(false);
      expect(two.tickets[0]?.id).not.toBe(one.tickets[0]?.id);
      expect(harness.tickets.tickets).toHaveLength(2);
    });
  });

  describe("ticket numbering", () => {
    test("numbers are unique and contiguous across many purchases", async () => {
      for (let i = 0; i < 5; i++) {
        await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 2 });
      }

      const numbers = harness.tickets.tickets.map((ticket) => ticket.ticketNumber);
      expect(numbers).toHaveLength(10);
      expect(new Set(numbers).size).toBe(10);
      expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test("a replay does not consume further numbers", async () => {
      await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 2 }, "dup-key-0001");
      await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 2 }, "dup-key-0001");
      const next = await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 });

      expect(next.tickets[0]?.ticketNumber).toBe(3);
      expect(harness.raffles.raffles.get("raf_1")?.ticketsSold).toBe(3);
    });
  });

  describe("a raffle cannot sell more tickets than exist", () => {
    test("selling out is exact, and the next purchase is refused", async () => {
      // raf_1 has 10 tickets; buy them in uneven batches.
      for (const quantity of [4, 3, 2, 1]) {
        await harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity });
      }

      expect(harness.tickets.tickets).toHaveLength(10);
      expect(harness.raffles.raffles.get("raf_1")?.ticketsSold).toBe(10);

      await expect(
        harness.buy({ userId: "usr_1", raffleId: "raf_1", quantity: 1 }),
      ).rejects.toThrow(NotEnoughTicketsError);
      expect(harness.tickets.tickets).toHaveLength(10);
    });
  });
});
