import type { Database } from "bun:sqlite";

/**
 * Conventions: ids are strings, timestamps are ISO-8601 UTC (lexicographically
 * comparable), money is INTEGER cents.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prizes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  value       INTEGER NOT NULL DEFAULT 0,
  image_url   TEXT
);

CREATE TABLE IF NOT EXISTS raffles (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  prize_id          TEXT NOT NULL REFERENCES prizes(id),
  ticket_price      INTEGER NOT NULL CHECK (ticket_price >= 0),
  max_tickets       INTEGER NOT NULL CHECK (max_tickets > 0),
  tickets_sold      INTEGER NOT NULL DEFAULT 0 CHECK (tickets_sold >= 0),
  draw_date         TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (
                      status IN ('draft','active','closed','drawn','cancelled')
                    ),
  winning_ticket_id TEXT REFERENCES tickets(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (tickets_sold <= max_tickets)
);

CREATE TABLE IF NOT EXISTS tickets (
  id             TEXT PRIMARY KEY,
  raffle_id      TEXT NOT NULL REFERENCES raffles(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  purchased_at   TEXT NOT NULL,
  ticket_number  INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (
                   status IN ('reserved','confirmed','expired','refunded')
                 ),
  reserved_until TEXT,
  payment_id     TEXT,
  UNIQUE (raffle_id, ticket_number)
);

-- The primary key is what turns a retried purchase into a lookup.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope        TEXT NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id),
  key          TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response     TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (scope, user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_raffles_status_draw_date ON raffles(status, draw_date);
CREATE INDEX IF NOT EXISTS idx_tickets_raffle_status ON tickets(raffle_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id, purchased_at DESC);
`;

export const applyMigrations = (db: Database): void => {
  db.run("PRAGMA foreign_keys = ON");
  db.run(SCHEMA);
};
