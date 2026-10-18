import { Elysia } from "elysia";
import { createProvider } from "difunkt";
import { AUTH_SERVICE } from "../features/auth/auth.providers";

/**
 * `auth: true` resolves a loaded `user` into the handler context;
 * `adminKey: true` guards operational routes with a shared secret.
 *
 * Both read `request.headers` rather than the destructured `headers`: when a
 * route declares its own `headers` schema, Elysia populates the context with
 * only the keys in that schema, silently hiding the authorization header.
 */
export const AuthPlugin = createProvider(({ inject }) => {
  const authService = inject(AUTH_SERVICE);

  return new Elysia({ name: "plugin.auth" }).macro({
    auth: {
      resolve: async ({ request }) => ({
        user: await authService.authenticate(
          request.headers.get("authorization") ?? undefined,
        ),
      }),
    },
    adminKey: {
      beforeHandle: ({ request }) => {
        authService.assertAdmin(request.headers.get("x-admin-key") ?? undefined);
      },
    },
  });
});
