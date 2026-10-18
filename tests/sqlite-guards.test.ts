/**
 * The conditional UPDATEs are all that stands between two separate processes
 * and an oversold raffle or overdrawn balance. In one process the service's
 * pre-checks fire first, so these call them the way a lost race would.
 */
import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { applyMigrations } from "../src/core/database/migrations";
import { createSqliteIdempotencyStore } from "../src/core/idempotency/idempotency.repository";
import { createSqliteRaffleRepository } from "../src/features/raffle/raffle.repository";
import { createSqliteTicketRepository } from "../src/features/ticket/ticket.repository";
import { createSqliteUserRepository } from "../src/features/user/user.repository";

const NOW = new Date("2026-01-15T12:00:00.000Z");
const FUTURE = "2099-01-01T00:00:00.000Z";

let db: Database;
let raffles: ReturnType<typeof createSqliteRaffleRepository>;
let users: ReturnType<typeof createSqliteUserRepository>;
let tickets: ReturnType<typeof createSqliteTicketRepository>;
let idempotency: ReturnType<typeof createSqliteIdempotencyStore>;

const seedRaffle = (status: string, maxTickets: number, ticketsSold: number) => {
  db.run(
    `INSERT INTO raffles
       (id, name, description, prize_id, ticket_price, max_tickets, tickets_sold,
        draw_date, status, created_at, updated_at)
     VALUES ('raf_1','R','', 'prz_1', 500, ?, ?, ?, ?, ?, ?)`,
    [maxTickets, ticketsSold, FUTURE, status, NOW.toISOString(), NOW.toISOString()],
  );
};

beforeEach(() => {
  db = new Database(":memory:");
  applyMigrations(db);
  db.run("INSERT INTO prizes (id, name, description, value) VALUES ('prz_1','P','',1)");
  db.run(
    "INSERT INTO users (id, email, name, balance, created_at) VALUES ('usr_1','a@b.c','A',1000,?)",
    [NOW.toISOString()],
  );
  raffles = createSqliteRaffleRepository(db);
  users = createSqliteUserRepository(db);
  tickets = createSqliteTicketRepository(db);
  idempotency = createSqliteIdempotencyStore(db);
});

describe("reserveTicketSlots refuses to oversell", () => {
  test("claims slots and reports the new total", () => {
    seedRaffle("active", 10, 0);
    expect(raffles.reserveTicketSlots("raf_1", 4, NOW)).toBe(4);
    expect(raffles.reserveTicketSlots("raf_1", 6, NOW)).toBe(10);
  });

  test("refuses the request that would exceed capacity, and changes nothing", () => {
    seedRaffle("active", 10, 9);

    expect(raffles.reserveTicketSlots("raf_1", 2, NOW)).toBeNull();
    expect(raffles.findById("raf_1")?.ticketsSold).toBe(9);
    // Exactly the remainder still works.
    expect(raffles.reserveTicketSlots("raf_1", 1, NOW)).toBe(10);
  });

  test("refuses once the raffle is sold out", () => {
    seedRaffle("active", 3, 3);
    expect(raffles.reserveTicketSlots("raf_1", 1, NOW)).toBeNull();
  });

  test.each(["draft", "closed", "drawn", "cancelled"])(
    "refuses a %s raffle even with capacity to spare",
    (status) => {
      seedRaffle(status, 10, 0);
      expect(raffles.reserveTicketSlots("raf_1", 1, NOW)).toBeNull();
      expect(raffles.findById("raf_1")?.ticketsSold).toBe(0);
    },
  );

  test("many sequential claims never exceed capacity in total", () => {
    seedRaffle("active", 7, 0);
    const granted = Array.from({ length: 20 }, () =>
      raffles.reserveTicketSlots("raf_1", 1, NOW),
    ).filter((result) => result !== null);

    expect(granted).toHaveLength(7);
    // Ticket numbering is derived from these totals.
    expect(granted).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("the schema rejects an oversold row even if the guard were bypassed", () => {
    seedRaffle("active", 5, 5);
    expect(() => db.run("UPDATE raffles SET tickets_sold = 6 WHERE id = 'raf_1'")).toThrow();
  });
});

describe("debit refuses to overdraw", () => {
  test("deducts and returns the new balance", () => {
    expect(users.debit("usr_1", 400)).toBe(600);
  });

  test("refuses a debit larger than the balance and leaves it untouched", () => {
    expect(users.debit("usr_1", 1001)).toBeNull();
    expect(users.findById("usr_1")?.balance).toBe(1000);
  });

  test("allows spending down to exactly zero but no further", () => {
    expect(users.debit("usr_1", 1000)).toBe(0);
    expect(users.debit("usr_1", 1)).toBeNull();
  });

  test("refuses an unknown user", () => {
    expect(users.debit("usr_missing", 1)).toBeNull();
  });
});

describe("ticket numbers are unique per raffle", () => {
  const ticket = (id: string, raffleId: string, ticketNumber: number) => ({
    id,
    raffleId,
    userId: "usr_1",
    purchasedAt: NOW,
    ticketNumber,
    status: "confirmed" as const,
    reservedUntil: null,
    paymentId: "pay_1",
  });

  beforeEach(() => seedRaffle("active", 10, 0));

  test("the same number cannot be issued twice for one raffle", () => {
    tickets.insertMany([ticket("tkt_1", "raf_1", 1)]);
    expect(() => tickets.insertMany([ticket("tkt_2", "raf_1", 1)])).toThrow(/UNIQUE/i);
  });

  test("the same number in a different raffle is fine", () => {
    db.run(
      `INSERT INTO raffles (id, name, description, prize_id, ticket_price, max_tickets,
         tickets_sold, draw_date, status, created_at, updated_at)
       VALUES ('raf_2','R2','', 'prz_1', 500, 10, 0, ?, 'active', ?, ?)`,
      [FUTURE, NOW.toISOString(), NOW.toISOString()],
    );
    tickets.insertMany([ticket("tkt_1", "raf_1", 1), ticket("tkt_2", "raf_2", 1)]);
    expect(tickets.listConfirmedByRaffle("raf_2")).toHaveLength(1);
  });
});

describe("idempotency keys", () => {
  test("a stored key is found again within its scope and user", () => {
    idempotency.save("purchase", "usr_1", "k1", "hash", '{"ok":true}', NOW);

    expect(idempotency.find("purchase", "usr_1", "k1")).toEqual({
      requestHash: "hash",
      response: '{"ok":true}',
    });
    expect(idempotency.find("purchase", "usr_other", "k1")).toBeNull();
    expect(idempotency.find("other_scope", "usr_1", "k1")).toBeNull();
  });

  test("the same key cannot be recorded twice for one user and scope", () => {
    idempotency.save("purchase", "usr_1", "k1", "hash", "{}", NOW);
    expect(() =>
      idempotency.save("purchase", "usr_1", "k1", "hash", "{}", NOW),
    ).toThrow(/UNIQUE|PRIMARY/i);
  });
});
