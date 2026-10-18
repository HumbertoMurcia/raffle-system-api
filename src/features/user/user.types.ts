import { t } from "elysia";
import type { IUser } from "../../../interfaces";

export type { IUser };

export interface IUserRepository {
  findById(id: string): IUser | null;
  findByEmail(email: string): IUser | null;
  /**
   * Returns the new balance, or `null` if it was insufficient. The guard is in
   * the WHERE clause, so concurrent debits cannot overdraw.
   */
  debit(userId: string, amount: number): number | null;
}

export interface IUserService {
  getById(id: string): Promise<IUser>;
  getByEmail(email: string): Promise<IUser>;
}

export interface UserView {
  id: string;
  email: string;
  name: string;
  balance: number;
  createdAt: string;
}

export const toUserView = (user: IUser): UserView => ({
  id: user.id,
  email: user.email,
  name: user.name,
  balance: user.balance,
  createdAt: user.createdAt.toISOString(),
});

// --- HTTP schemas -----------------------------------------------------------

export const UserViewSchema = t.Object({
  id: t.String(),
  email: t.String({ format: "email" }),
  name: t.String(),
  balance: t.Integer({ description: "Available balance in cents" }),
  createdAt: t.String({ format: "date-time" }),
});
