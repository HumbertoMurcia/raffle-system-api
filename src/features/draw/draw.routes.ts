import { Elysia, t } from "elysia";
import { createProvider } from "difunkt";
import { AuthPlugin } from "../../plugins/auth.plugin";
import { ErrorResponseSchema } from "../../plugins/error-handler.plugin";
import { DRAW_SERVICE } from "./draw.providers";
import { DrawResultSchema } from "./draw.types";

/** Operational endpoints: trigger the scheduled draw on demand. */
export const DrawRoutes = createProvider(({ inject }) => {
  const draws = inject(DRAW_SERVICE);
  const auth = inject(AuthPlugin);

  return new Elysia({ name: "routes.draw", prefix: "/admin" })
    .use(auth)
    .post(
      "/draws/run",
      async () => ({ data: await draws.runDueDraws() }),
      {
        adminKey: true,
        response: {
          200: t.Object({ data: t.Array(DrawResultSchema) }),
          403: ErrorResponseSchema,
        },
      },
    )
    .post(
      "/raffles/:id/draw",
      async ({ params }) => draws.drawRaffle(params.id),
      {
        adminKey: true,
        params: t.Object({ id: t.String() }),
        response: {
          200: DrawResultSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    );
});
