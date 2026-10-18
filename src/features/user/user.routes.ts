import { Elysia } from "elysia";
import { createProvider } from "difunkt";
import { AuthPlugin } from "../../plugins/auth.plugin";
import { ErrorResponseSchema } from "../../plugins/error-handler.plugin";
import { USER_SERVICE } from "./user.providers";
import { UserViewSchema, toUserView } from "./user.types";

export const UserRoutes = createProvider(({ inject }) => {
  const users = inject(USER_SERVICE);
  const auth = inject(AuthPlugin);

  return new Elysia({ name: "routes.user" })
    .use(auth)
    .get(
      "/me",
      async ({ user }) => toUserView(await users.getById(user.id)),
      {
        auth: true,
        response: { 200: UserViewSchema, 401: ErrorResponseSchema },
      },
    );
});
