import type { Database } from "bun:sqlite";
import type { Clock } from "../platform.providers";

const iso = (date: Date): string => date.toISOString();
const plusDays = (from: Date, days: number): Date =>
  new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
const plusHours = (from: Date, hours: number): Date =>
  new Date(from.getTime() + hours * 60 * 60 * 1000);

/** No-op once any user exists, so restarting does not duplicate rows. */
export const seedDatabase = (db: Database, clock: Clock): void => {
  const existing = db
    .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM users")
    .get();
  if (existing && existing.count > 0) return;

  const now = clock.now();
  const createdAt = iso(now);

  const insertUser = db.prepare(
    "INSERT INTO users (id, email, name, balance, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertPrize = db.prepare(
    "INSERT INTO prizes (id, name, description, value, image_url) VALUES (?, ?, ?, ?, ?)",
  );
  const insertRaffle = db.prepare(
    `INSERT INTO raffles
       (id, name, description, prize_id, ticket_price, max_tickets, tickets_sold,
        draw_date, status, winning_ticket_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  );
  const insertTicket = db.prepare(
    `INSERT INTO tickets
       (id, raffle_id, user_id, purchased_at, ticket_number, status, reserved_until, payment_id)
     VALUES (?, ?, ?, ?, ?, 'confirmed', NULL, ?)`,
  );

  db.transaction(() => {
    insertUser.run("usr_alice", "alice@example.com", "Alice Nguyen", 50_000, createdAt);
    insertUser.run("usr_bob", "bob@example.com", "Bob Okafor", 1_200, createdAt);
    insertUser.run("usr_carol", "carol@example.com", "Carol Diaz", 0, createdAt);

    insertPrize.run("prz_rig", "Gaming Rig", "RTX-class desktop build", 250_000, null);
    insertPrize.run("prz_trip", "Weekend Getaway", "Two nights, flights included", 120_000, null);
    insertPrize.run("prz_coffee", "Espresso Machine", "Prosumer dual-boiler", 180_000, null);
    insertPrize.run("prz_console", "Retro Console", "Mint-condition classic", 40_000, null);

    insertRaffle.run(
      "raf_rig", "Gaming Rig Giveaway", "Win a complete high-end desktop.",
      "prz_rig", 500, 100, 0, iso(plusDays(now, 7)), "active", createdAt, createdAt,
    );
    insertRaffle.run(
      "raf_trip", "Weekend Getaway", "A two-night break for two.",
      "prz_trip", 2_500, 50, 0, iso(plusDays(now, 1)), "active", createdAt, createdAt,
    );
    insertRaffle.run(
      "raf_coffee", "Espresso Machine", "Not on sale yet.",
      "prz_coffee", 1_000, 200, 0, iso(plusDays(now, 14)), "draft", createdAt, createdAt,
    );

    // Past its draw date with tickets sold, so the scheduler draws it on its
    // first tick and the draw is observable without waiting.
    insertRaffle.run(
      "raf_console", "Retro Console", "Draw date has already passed.",
      "prz_console", 300, 10, 3, iso(plusHours(now, -1)), "active", createdAt, createdAt,
    );
    insertTicket.run("tkt_console_1", "raf_console", "usr_alice", createdAt, 1, "pay_seed_1");
    insertTicket.run("tkt_console_2", "raf_console", "usr_alice", createdAt, 2, "pay_seed_1");
    insertTicket.run("tkt_console_3", "raf_console", "usr_bob", createdAt, 3, "pay_seed_2");
  })();
};
