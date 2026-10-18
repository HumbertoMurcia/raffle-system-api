import { createModule, provide } from "difunkt";
import { DATABASE } from "../../core/database/database.providers";
import { RAFFLE_REPOSITORY, RAFFLE_SERVICE } from "./raffle.providers";
import { createSqliteRaffleRepository } from "./raffle.repository";
import { createRaffleService } from "./raffle.service";
import { RaffleRoutes } from "./raffle.routes";

export const RaffleModule = createModule({
  providers: [
    provide(RAFFLE_REPOSITORY, {
      factory: ({ inject }) => createSqliteRaffleRepository(inject(DATABASE)),
    }),
    provide(RAFFLE_SERVICE, {
      factory: ({ inject }) => createRaffleService(inject(RAFFLE_REPOSITORY)),
    }),
    RaffleRoutes,
  ],
});
