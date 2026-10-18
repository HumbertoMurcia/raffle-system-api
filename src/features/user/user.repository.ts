import type { Database } from "bun:sqlite";
import type { IUser, IUserRepository } from "./user.types";

interface UserRow {
  id: string;
  email: string;
  name: string;
  balance: number;
  created_at: string;
}

const toUser = (row: UserRow): IUser => ({
  id: row.id,
  email: row.email,
  name: row.name,
  balance: row.balance,
  createdAt: new Date(row.created_at),
});

export const createSqliteUserRepository = (db: Database): IUserRepository => {
  const findByIdStmt = db.query<UserRow, [string]>("SELECT * FROM users WHERE id = ?");
  const findByEmailStmt = db.query<UserRow, [string]>("SELECT * FROM users WHERE email = ?");
  const debitStmt = db.query<{ balance: number }, [number, string, number]>(
    `UPDATE users SET balance = balance - ?
      WHERE id = ? AND balance >= ?
      RETURNING balance`,
  );

  return {
    findById: (id) => {
      const row = findByIdStmt.get(id);
      return row ? toUser(row) : null;
    },

    findByEmail: (email) => {
      const row = findByEmailStmt.get(email);
      return row ? toUser(row) : null;
    },

    debit: (userId, amount) => debitStmt.get(amount, userId, amount)?.balance ?? null,
  };
};
