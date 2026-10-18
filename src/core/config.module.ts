import { createModule, provide } from "difunkt";
import { APP_CONFIG, type AppConfig } from "./config.providers";

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value === "true" || value === "1";

/** Bun loads `.env` automatically. */
const loadConfigFromEnv = (
  env: Record<string, string | undefined> = process.env,
): AppConfig => ({
  port: int(env.PORT, 3000),
  database: {
    url: env.DATABASE_URL ?? "./data/raffle.sqlite",
    seed: bool(env.DATABASE_SEED, true),
  },
  auth: {
    secret: env.AUTH_SECRET ?? "dev-only-insecure-secret",
    tokenTtlSeconds: int(env.AUTH_TOKEN_TTL_SECONDS, 60 * 60 * 24),
  },
  draw: {
    enabled: bool(env.DRAW_SCHEDULER_ENABLED, true),
    intervalMs: int(env.DRAW_SCHEDULER_INTERVAL_MS, 30_000),
  },
  admin: {
    apiKey: env.ADMIN_API_KEY ?? "dev-admin-key",
  },
  purchase: {
    maxTicketsPerPurchase: int(env.MAX_TICKETS_PER_PURCHASE, 20),
  },
  logging: {
    enabled: bool(env.LOGGING_ENABLED, true),
  },
});

export const ConfigModule = createModule({
  providers: [provide(APP_CONFIG, { factory: () => loadConfigFromEnv() })],
});
