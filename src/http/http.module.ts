import { Elysia, t } from "elysia";
import { createModule, createProvider } from "difunkt";
import { AuthRoutes } from "../features/auth/auth.routes";
import { DrawRoutes } from "../features/draw/draw.routes";
import { RaffleRoutes } from "../features/raffle/raffle.routes";
import { TicketRoutes } from "../features/ticket/ticket.routes";
import { UserRoutes } from "../features/user/user.routes";
import { ErrorHandlerPlugin } from "../plugins/error-handler.plugin";
import { LoggerPlugin } from "../plugins/logger.plugin";

/**
 * Composition root for HTTP: every plugin and route group is injected, so this
 * is the only file that knows the shape of the API surface.
 */
export const HttpApp = createProvider(({ inject }) =>
  new Elysia({ name: "http.app" })
    .use(inject(ErrorHandlerPlugin))
    .use(inject(LoggerPlugin))
    .get("/health", () => ({ status: "ok" }), {
      response: { 200: t.Object({ status: t.String() }) },
    })
    .use(inject(AuthRoutes))
    .use(inject(UserRoutes))
    .use(inject(RaffleRoutes))
    .use(inject(TicketRoutes))
    .use(inject(DrawRoutes)),
);

export const HttpModule = createModule({ providers: [HttpApp] });
