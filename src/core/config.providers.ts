import { createProviderToken } from "difunkt";

/** All monetary amounts are integer cents. */
export interface AppConfig {
  readonly port: number;
  readonly database: {
    /** `:memory:` or a path to a SQLite file. */
    readonly url: string;
    readonly seed: boolean;
  };
  readonly auth: {
    readonly secret: string;
    readonly tokenTtlSeconds: number;
  };
  readonly draw: {
    readonly enabled: boolean;
    readonly intervalMs: number;
  };
  readonly admin: {
    readonly apiKey: string;
  };
  readonly purchase: {
    readonly maxTicketsPerPurchase: number;
  };
  readonly logging: {
    readonly enabled: boolean;
  };
}

export const APP_CONFIG = createProviderToken<AppConfig>("core.config");
