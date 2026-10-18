import { timingSafeEqual } from "node:crypto";
import { ForbiddenError, UnauthorizedError } from "../../core/errors";
import type { AppConfig } from "../../core/config.providers";
import type { Clock } from "../../core/platform.providers";
import type { IUserRepository } from "../user/user.types";
import type { AuthTokenPayload, IAuthService } from "./auth.types";

const sign = (data: string, secret: string): string =>
  new Bun.CryptoHasher("sha256", secret).update(data).digest("hex");

const safeEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const createAuthService = (
  users: IUserRepository,
  config: AppConfig,
  clock: Clock,
): IAuthService => {
  const { secret, tokenTtlSeconds } = config.auth;

  const issue = (payload: AuthTokenPayload): string => {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${sign(body, secret)}`;
  };

  const verify = (token: string): AuthTokenPayload => {
    const [body, signature] = token.split(".");
    if (!body || !signature || !safeEquals(signature, sign(body, secret))) {
      throw new UnauthorizedError("Invalid token");
    }

    let payload: AuthTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
      throw new UnauthorizedError("Malformed token");
    }

    if (payload.exp * 1000 <= clock.now().getTime()) {
      throw new UnauthorizedError("Token has expired");
    }
    return payload;
  };

  return {
    async login(email) {
      const user = users.findByEmail(email);
      if (!user) throw new UnauthorizedError("Unknown account");

      const expiresAt = new Date(clock.now().getTime() + tokenTtlSeconds * 1000);
      const token = issue({
        sub: user.id,
        email: user.email,
        exp: Math.floor(expiresAt.getTime() / 1000),
      });
      return { token, expiresAt, user };
    },

    async authenticate(authorizationHeader) {
      const [scheme, token] = (authorizationHeader ?? "").split(" ");
      if (scheme?.toLowerCase() !== "bearer" || !token) {
        throw new UnauthorizedError("Expected an 'Authorization: Bearer <token>' header");
      }

      const payload = verify(token);
      const user = users.findById(payload.sub);
      // The token can outlive the account it was issued for.
      if (!user) throw new UnauthorizedError("Account no longer exists");
      return user;
    },

    assertAdmin(adminKeyHeader) {
      if (!adminKeyHeader || !safeEquals(adminKeyHeader, config.admin.apiKey)) {
        throw new ForbiddenError("A valid 'x-admin-key' header is required");
      }
    },
  };
};
