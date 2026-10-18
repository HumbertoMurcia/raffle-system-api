import type { Database } from "bun:sqlite";
import type { IIdempotencyStore, IdempotencyRecord } from "./idempotency.providers";

interface IdempotencyRow {
  request_hash: string;
  response: string;
}

export const createSqliteIdempotencyStore = (db: Database): IIdempotencyStore => {
  const findStmt = db.query<IdempotencyRow, [string, string, string]>(
    `SELECT request_hash, response FROM idempotency_keys
      WHERE scope = ? AND user_id = ? AND key = ?`,
  );
  const saveStmt = db.prepare(
    `INSERT INTO idempotency_keys (scope, user_id, key, request_hash, response, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  return {
    find: (scope, userId, key): IdempotencyRecord | null => {
      const row = findStmt.get(scope, userId, key);
      return row ? { requestHash: row.request_hash, response: row.response } : null;
    },

    save: (scope, userId, key, requestHash, response, now) => {
      saveStmt.run(scope, userId, key, requestHash, response, now.toISOString());
    },
  };
};
