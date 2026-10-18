import { Elysia, t } from "elysia";
import { createProvider } from "difunkt";
import { AuthPlugin } from "../../plugins/auth.plugin";
import { ErrorResponseSchema } from "../../plugins/error-handler.plugin";
import { TICKET_SERVICE } from "./ticket.providers";
import {
  PurchaseTicketsBodySchema,
  PurchaseTicketsHeadersSchema,
  PurchaseTicketsResultSchema,
  TicketViewSchema,
  toTicketView,
} from "./ticket.types";

export const TicketRoutes = createProvider(({ inject }) => {
  const tickets = inject(TICKET_SERVICE);
  const auth = inject(AuthPlugin);

  return new Elysia({ name: "routes.ticket" })
    .use(auth)
    .post(
      "/raffles/:id/tickets",
      async ({ params, body, headers, user, set }) => {
        const result = await tickets.purchase({
          userId: user.id,
          raffleId: params.id,
          quantity: body.quantity,
          idempotencyKey: headers["idempotency-key"],
        });
        set.headers["idempotent-replay"] = String(result.replayed);
        set.status = 201;
        return {
          tickets: result.tickets.map(toTicketView),
          totalCost: result.totalCost,
          remainingBalance: result.remainingBalance,
          paymentId: result.paymentId,
          replayed: result.replayed,
        };
      },
      {
        auth: true,
        params: t.Object({ id: t.String() }),
        headers: PurchaseTicketsHeadersSchema,
        body: PurchaseTicketsBodySchema,
        response: {
          201: PurchaseTicketsResultSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          402: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    )
    .get(
      "/me/tickets",
      async ({ user }) => {
        const owned = await tickets.listForUser(user.id);
        return { data: owned.map(toTicketView) };
      },
      {
        auth: true,
        response: {
          200: t.Object({ data: t.Array(TicketViewSchema) }),
          401: ErrorResponseSchema,
        },
      },
    );
});
