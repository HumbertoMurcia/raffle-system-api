import type { UnitOfWork } from "../../src/core/database/database.providers";
import type { Clock, IdGenerator, RandomSource } from "../../src/core/platform.providers";
import type { AppConfig } from "../../src/core/config.providers";

/** Nothing in the system reads the real time. */
export const fixedClock = (at: Date): Clock => ({ now: () => at });

/** Predictable ids so assertions can name them. */
export const createSequentialIds = (prefix = "id"): IdGenerator => {
  let counter = 0;
  return { next: () => `${prefix}_${++counter}` };
};

/** Records the pool size it was given. */
export const createScriptedRandom = (pick: number) => {
  const calls: number[] = [];
  return {
    calls,
    int: (maxExclusive: number) => {
      calls.push(maxExclusive);
      return pick;
    },
  } satisfies RandomSource & { calls: number[] };
};

/** Inline: real atomicity is covered by the integration tests. */
export const passthroughUnitOfWork: UnitOfWork = { transaction: (work) => work() };

export const testConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  port: 0,
  database: { url: ":memory:", seed: true },
  auth: { secret: "test-secret", tokenTtlSeconds: 3600 },
  draw: { enabled: false, intervalMs: 1_000 },
  admin: { apiKey: "test-admin-key" },
  purchase: { maxTicketsPerPurchase: 20 },
  logging: { enabled: false },
  ...overrides,
});
