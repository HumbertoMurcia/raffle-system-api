/**
 * `RANDOM_SOURCE` is overridden with a scripted double, so "pick a random
 * winner" becomes an assertion about which ticket came out of which pool.
 */
import { describe, expect, test } from "bun:test";
import { createApplication, provide } from "difunkt";
import { APP_CONFIG } from "../src/core/config.providers";
import { UNIT_OF_WORK } from "../src/core/database/database.providers";
import { CLOCK, RANDOM_SOURCE } from "../src/core/platform.providers";
import { DrawModule } from "../src/features/draw/draw.module";
import { DRAW_SERVICE } from "../src/features/draw/draw.providers";
import { RAFFLE_REPOSITORY } from "../src/features/raffle/raffle.providers";
import { TICKET_REPOSITORY } from "../src/features/ticket/ticket.providers";
import type { IRaffle } from "../src/features/raffle/raffle.types";
import type { ITicket } from "../src/features/ticket/ticket.types";
import {
  fixedClock,
  createScriptedRandom,
  passthroughUnitOfWork,
  testConfig,
} from "./helpers/fakes";
import {
  createInMemoryRaffleRepository,
  createInMemoryTicketRepository,
  makeRaffle,
  makeTicket,
} from "./helpers/in-memory-repositories";

const NOW = new Date("2026-01-15T12:00:00.000Z");
const PAST = new Date("2026-01-01T00:00:00.000Z");
const FUTURE = new Date("2026-02-01T00:00:00.000Z");

const buildHarness = async (
  seedRaffles: IRaffle[],
  seedTickets: ITicket[],
  pick = 0,
) => {
  const raffles = createInMemoryRaffleRepository(seedRaffles);
  const tickets = createInMemoryTicketRepository(seedTickets);
  const random = createScriptedRandom(pick);

  const resolve = await createApplication(DrawModule, {
    providers: [
      provide(APP_CONFIG, { value: testConfig() }),
      provide(UNIT_OF_WORK, { value: passthroughUnitOfWork }),
      provide(CLOCK, { value: fixedClock(NOW) }),
      provide(RANDOM_SOURCE, { value: random }),
      provide(RAFFLE_REPOSITORY, { value: raffles }),
      provide(TICKET_REPOSITORY, { value: tickets }),
    ],
  });

  return { service: resolve(DRAW_SERVICE), raffles, tickets, random };
};

const dueRaffle = makeRaffle({ id: "raf_1", drawDate: PAST, ticketsSold: 3 });
const entries = [
  makeTicket({ id: "tkt_1", raffleId: "raf_1", userId: "usr_a", ticketNumber: 1 }),
  makeTicket({ id: "tkt_2", raffleId: "raf_1", userId: "usr_b", ticketNumber: 2 }),
  makeTicket({ id: "tkt_3", raffleId: "raf_1", userId: "usr_c", ticketNumber: 3 }),
];

describe("raffle draw use case", () => {
  test("selects a winner from the confirmed tickets and records it", async () => {
    const { service, raffles, random } = await buildHarness([dueRaffle], entries, 1);

    const [result] = await service.runDueDraws();

    expect(result).toEqual({
      raffleId: "raf_1",
      outcome: "drawn",
      winningTicketId: "tkt_2",
      winnerUserId: "usr_b",
    });
    // Drawn from the whole eligible pool, not a prefix of it.
    expect(random.calls).toEqual([3]);

    const raffle = raffles.raffles.get("raf_1");
    expect(raffle?.status).toBe("drawn");
    expect(raffle?.winningTicketId).toBe("tkt_2");
  });

  test("only tickets in `confirmed` state can win", async () => {
    const mixed = [
      makeTicket({ id: "tkt_refunded", raffleId: "raf_1", status: "refunded" }),
      makeTicket({ id: "tkt_live", raffleId: "raf_1", userId: "usr_a", status: "confirmed" }),
    ];
    const { service, random } = await buildHarness([dueRaffle], mixed, 0);

    const [result] = await service.runDueDraws();

    expect(random.calls).toEqual([1]);
    expect(result?.winningTicketId).toBe("tkt_live");
  });

  test("a raffle that reached its draw date with no entries is closed, not drawn", async () => {
    const { service, raffles } = await buildHarness([dueRaffle], []);

    const [result] = await service.runDueDraws();

    expect(result?.outcome).toBe("closed_no_entries");
    expect(result?.winningTicketId).toBeNull();
    expect(raffles.raffles.get("raf_1")?.status).toBe("closed");
  });

  test("raffles before their draw date are left alone", async () => {
    const upcoming = makeRaffle({ id: "raf_future", drawDate: FUTURE });
    const { service, raffles } = await buildHarness([upcoming], []);

    expect(await service.runDueDraws()).toEqual([]);
    expect(raffles.raffles.get("raf_future")?.status).toBe("active");
  });

  // The scheduler may overlap a manual trigger.
  test("running the draw twice keeps the first winner", async () => {
    const { service, raffles } = await buildHarness([dueRaffle], entries, 2);

    const first = await service.drawRaffle("raf_1");
    const second = await service.drawRaffle("raf_1");

    expect(first.outcome).toBe("drawn");
    expect(second.outcome).toBe("skipped");
    expect(raffles.raffles.get("raf_1")?.winningTicketId).toBe(first.winningTicketId);
  });

  test("draws every due raffle in one pass", async () => {
    const second = makeRaffle({ id: "raf_2", drawDate: PAST });
    const { service } = await buildHarness(
      [dueRaffle, second],
      [...entries, makeTicket({ id: "tkt_4", raffleId: "raf_2", userId: "usr_d" })],
    );

    const results = await service.runDueDraws();

    expect(results.map((result) => result.raffleId)).toEqual(["raf_1", "raf_2"]);
    expect(results.every((result) => result.outcome === "drawn")).toBe(true);
  });
});
