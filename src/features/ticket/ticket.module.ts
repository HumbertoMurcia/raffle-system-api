import { createModule, provide } from "difunkt";
import { APP_CONFIG } from "../../core/config.providers";
import { DATABASE, UNIT_OF_WORK } from "../../core/database/database.providers";
import { IDEMPOTENCY_STORE } from "../../core/idempotency/idempotency.providers";
import { CLOCK, ID_GENERATOR } from "../../core/platform.providers";
import { RAFFLE_REPOSITORY } from "../raffle/raffle.providers";
import { USER_REPOSITORY } from "../user/user.providers";
import { TICKET_REPOSITORY, TICKET_SERVICE } from "./ticket.providers";
import { createSqliteTicketRepository } from "./ticket.repository";
import { createTicketService } from "./ticket.service";
import { TicketRoutes } from "./ticket.routes";

export const TicketModule = createModule({
  providers: [
    provide(TICKET_REPOSITORY, {
      factory: ({ inject }) => createSqliteTicketRepository(inject(DATABASE)),
    }),
    provide(TICKET_SERVICE, {
      factory: ({ inject }) =>
        createTicketService({
          tickets: inject(TICKET_REPOSITORY),
          raffles: inject(RAFFLE_REPOSITORY),
          users: inject(USER_REPOSITORY),
          idempotency: inject(IDEMPOTENCY_STORE),
          unitOfWork: inject(UNIT_OF_WORK),
          clock: inject(CLOCK),
          ids: inject(ID_GENERATOR),
          config: inject(APP_CONFIG),
        }),
    }),
    TicketRoutes,
  ],
});
