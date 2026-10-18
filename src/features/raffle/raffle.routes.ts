import { Elysia, t } from "elysia";
import { createProvider } from "difunkt";
import { ErrorResponseSchema } from "../../plugins/error-handler.plugin";
import { RAFFLE_SERVICE } from "./raffle.providers";
import { RaffleStatusSchema, RaffleViewSchema, toRaffleView } from "./raffle.types";

export const RaffleRoutes = createProvider(({ inject }) => {
  const raffles = inject(RAFFLE_SERVICE);

  return new Elysia({ name: "routes.raffle", prefix: "/raffles" })
    .get(
      "/",
      async ({ query }) => {
        const status = query.status ?? "active";
        const list = await raffles.list(status === "all" ? undefined : status);
        return { data: list.map(toRaffleView) };
      },
      {
        // Browsing defaults to active raffles; `?status=all` shows everything.
        query: t.Object({
          status: t.Optional(
            t.Union([RaffleStatusSchema, t.Literal("all")], { default: "active" }),
          ),
        }),
        response: { 200: t.Object({ data: t.Array(RaffleViewSchema) }) },
      },
    )
    .get(
      "/:id",
      async ({ params }) => toRaffleView(await raffles.getById(params.id)),
      {
        params: t.Object({ id: t.String() }),
        response: { 200: RaffleViewSchema, 404: ErrorResponseSchema },
      },
    );
});
