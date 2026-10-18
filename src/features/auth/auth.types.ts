import { t } from "elysia";
import { UserViewSchema } from "../user/user.types";
import type { IUser } from "../../../interfaces";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  /** Seconds since epoch. */
  exp: number;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: IUser;
}

/**
 * Mock login: no passwords, a known email is enough. The token itself is a
 * real HMAC-signed, expiring payload, so verification works as a JWT would.
 */
export interface IAuthService {
  login(email: string): Promise<LoginResult>;
  authenticate(authorizationHeader: string | undefined): Promise<IUser>;
  assertAdmin(adminKeyHeader: string | undefined): void;
}

// --- HTTP schemas -----------------------------------------------------------

export const LoginBodySchema = t.Object({
  email: t.String({ format: "email" }),
});

export const LoginResponseSchema = t.Object({
  token: t.String(),
  expiresAt: t.String({ format: "date-time" }),
  user: UserViewSchema,
});
