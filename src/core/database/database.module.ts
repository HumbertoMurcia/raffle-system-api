import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createModule, provide } from "difunkt";
import { APP_CONFIG } from "../config.providers";
import { CLOCK } from "../platform.providers";
import { DATABASE, UNIT_OF_WORK, type UnitOfWork } from "./database.providers";
import { applyMigrations } from "./migrations";
import { seedDatabase } from "./seed";

const BUSY_TIMEOUT_MS = 5_000;

const openDatabase = (url: string): Database => {
  if (url !== ":memory:" && url.includes("/")) {
    mkdirSync(dirname(url), { recursive: true });
  }
  const db = new Database(url, { create: true, strict: false });
  if (url !== ":memory:") db.run("PRAGMA journal_mode = WAL");
  // Wait for a contended write lock rather than failing the request.
  db.run(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return db;
};

export const DatabaseModule = createModule({
  providers: [
    provide(DATABASE, {
      factory: ({ inject }) => openDatabase(inject(APP_CONFIG).database.url),
    }),
    provide(UNIT_OF_WORK, {
      factory: ({ inject }): UnitOfWork => {
        const db = inject(DATABASE);
        // IMMEDIATE: take the write lock at BEGIN so concurrent writers queue
        // instead of failing mid-transaction, and so reads inside the
        // transaction see every prior commit.
        return { transaction: (work) => db.transaction(work).immediate() };
      },
    }),
  ],
  runnables: [
    ({ inject }) => {
      const db = inject(DATABASE);
      const config = inject(APP_CONFIG);
      applyMigrations(db);
      if (config.database.seed) seedDatabase(db, inject(CLOCK));
    },
  ],
});
