/**
 * In-memory doubles that reimplement the guards of the real repositories
 * (`debit` refuses to overdraw, `reserveTicketSlots` to oversell), so a
 * service tested against them is tested against its real contract.
 */
import type {
  IIdempotencyStore,
  IdempotencyRecord,
} from "../../src/core/idempotency/idempotency.providers";
import type { IRaffle, IRaffleRepository } from "../../src/features/raffle/raffle.types";
import type { ITicket, ITicketRepository } from "../../src/features/ticket/ticket.types";
import type { IUser, IUserRepository } from "../../src/features/user/user.types";

export const makeUser = (overrides: Partial<IUser> = {}): IUser => ({
  id: "usr_test",
  email: "test@example.com",
  name: "Test User",
  balance: 10_000,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const makeRaffle = (overrides: Partial<IRaffle> = {}): IRaffle => ({
  id: "raf_test",
  name: "Test Raffle",
  description: "",
  prize: {
    id: "prz_test",
    name: "Test Prize",
    description: "",
    value: 100_000,
    imageUrl: null,
  },
  ticketPrice: 500,
  maxTickets: 10,
  ticketsSold: 0,
  drawDate: new Date("2026-02-01T00:00:00.000Z"),
  status: "active",
  winningTicketId: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

export const makeTicket = (overrides: Partial<ITicket> = {}): ITicket => ({
  id: "tkt_test",
  raffleId: "raf_test",
  userId: "usr_test",
  purchasedAt: new Date("2026-01-01T00:00:00.000Z"),
  ticketNumber: 1,
  status: "confirmed",
  reservedUntil: null,
  paymentId: "pay_test",
  ...overrides,
});

export type InMemoryUserRepository = IUserRepository & { users: Map<string, IUser> };

export const createInMemoryUserRepository = (
  seed: readonly IUser[] = [],
): InMemoryUserRepository => {
  const users = new Map(seed.map((user) => [user.id, { ...user }]));

  return {
    users,
    findById: (id) => users.get(id) ?? null,
    findByEmail: (email) =>
      [...users.values()].find((user) => user.email === email) ?? null,
    debit: (userId, amount) => {
      const user = users.get(userId);
      if (!user || user.balance < amount) return null;
      user.balance -= amount;
      return user.balance;
    },
  };
};

export type InMemoryRaffleRepository = IRaffleRepository & {
  raffles: Map<string, IRaffle>;
};

export const createInMemoryRaffleRepository = (
  seed: readonly IRaffle[] = [],
): InMemoryRaffleRepository => {
  const raffles = new Map(seed.map((raffle) => [raffle.id, { ...raffle }]));

  return {
    raffles,
    findById: (id) => raffles.get(id) ?? null,
    list: (status) =>
      [...raffles.values()].filter((raffle) => !status || raffle.status === status),
    findDueForDraw: (now) =>
      [...raffles.values()].filter(
        (raffle) => raffle.status === "active" && raffle.drawDate <= now,
      ),
    reserveTicketSlots: (raffleId, quantity, now) => {
      const raffle = raffles.get(raffleId);
      if (!raffle) return null;
      if (raffle.status !== "active") return null;
      if (raffle.ticketsSold + quantity > raffle.maxTickets) return null;
      raffle.ticketsSold += quantity;
      raffle.updatedAt = now;
      return raffle.ticketsSold;
    },
    markDrawn: (raffleId, winningTicketId, now) => {
      const raffle = raffles.get(raffleId);
      if (!raffle || raffle.status !== "active") return false;
      raffle.status = "drawn";
      raffle.winningTicketId = winningTicketId;
      raffle.updatedAt = now;
      return true;
    },
    markClosed: (raffleId, now) => {
      const raffle = raffles.get(raffleId);
      if (!raffle || raffle.status !== "active") return false;
      raffle.status = "closed";
      raffle.updatedAt = now;
      return true;
    },
  };
};

export type InMemoryTicketRepository = ITicketRepository & { tickets: ITicket[] };

export const createInMemoryTicketRepository = (
  seed: readonly ITicket[] = [],
): InMemoryTicketRepository => {
  const tickets: ITicket[] = seed.map((ticket) => ({ ...ticket }));

  return {
    tickets,
    insertMany: (created) => {
      tickets.push(...created.map((ticket) => ({ ...ticket })));
    },
    findById: (id) => tickets.find((ticket) => ticket.id === id) ?? null,
    listByUser: (userId) => tickets.filter((ticket) => ticket.userId === userId),
    listConfirmedByRaffle: (raffleId) =>
      tickets.filter(
        (ticket) => ticket.raffleId === raffleId && ticket.status === "confirmed",
      ),
  };
};

export type InMemoryIdempotencyStore = IIdempotencyStore & {
  records: Map<string, IdempotencyRecord>;
};

export const createInMemoryIdempotencyStore = (): InMemoryIdempotencyStore => {
  const records = new Map<string, IdempotencyRecord>();
  const id = (scope: string, userId: string, key: string) => `${scope}|${userId}|${key}`;

  return {
    records,
    find: (scope, userId, key) => records.get(id(scope, userId, key)) ?? null,
    save: (scope, userId, key, requestHash, response) => {
      records.set(id(scope, userId, key), { requestHash, response });
    },
  };
};
