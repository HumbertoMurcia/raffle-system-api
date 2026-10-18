import { createProviderToken } from "difunkt";

export interface IdempotencyRecord {
  requestHash: string;
  response: string;
}

/** Scoped per user and operation, so one user cannot replay another's key. */
export interface IIdempotencyStore {
  find(scope: string, userId: string, key: string): IdempotencyRecord | null;
  save(
    scope: string,
    userId: string,
    key: string,
    requestHash: string,
    response: string,
    now: Date,
  ): void;
}

export const IDEMPOTENCY_STORE = createProviderToken<IIdempotencyStore>("core.idempotencyStore");

/** Catches a key reused for different input. */
export const fingerprint = (request: Record<string, unknown>): string => {
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(request).sort(([a], [b]) => a.localeCompare(b))),
  );
  return new Bun.CryptoHasher("sha256").update(canonical).digest("hex");
};
