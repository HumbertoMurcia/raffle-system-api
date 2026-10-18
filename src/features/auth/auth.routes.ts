import { Elysia } from "elysia";
import { createProvider } from "difunkt";
import { ErrorResponseSchema } from "../../plugins/error-handler.plugin";
import { toUserView } from "../user/user.types";
import { AUTH_SERVICE } from "./auth.providers";
import { LoginBodySchema, LoginResponseSchema } from "./auth.types";

export const AuthRoutes = createProvider(({ inject }) => {
  const authService = inject(AUTH_SERVICE);

  return new Elysia({ name: "routes.auth", prefix: "/auth" }).post(
    "/login",
    async ({ body }) => {
      const { token, expiresAt, user } = await authService.login(body.email);
      return { token, expiresAt: expiresAt.toISOString(), user: toUserView(user) };
    },
    {
      body: LoginBodySchema,
      response: { 200: LoginResponseSchema, 401: ErrorResponseSchema },
    },
  );
});
