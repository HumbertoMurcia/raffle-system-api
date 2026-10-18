import { createModule, provide } from "difunkt";
import { APP_CONFIG } from "../../core/config.providers";
import { UNIT_OF_WORK } from "../../core/database/database.providers";
import { CLOCK, RANDOM_SOURCE } from "../../core/platform.providers";
import { RAFFLE_REPOSITORY } from "../raffle/raffle.providers";
import { TICKET_REPOSITORY } from "../ticket/ticket.providers";
import { DRAW_SCHEDULER, DRAW_SERVICE } from "./draw.providers";
import { createDrawService } from "./draw.service";
import { createDrawScheduler } from "./draw.scheduler";
import { DrawRoutes } from "./draw.routes";

export const DrawModule = createModule({
  providers: [
    provide(DRAW_SERVICE, {
      factory: ({ inject }) =>
        createDrawService({
          raffles: inject(RAFFLE_REPOSITORY),
          tickets: inject(TICKET_REPOSITORY),
          unitOfWork: inject(UNIT_OF_WORK),
          clock: inject(CLOCK),
          random: inject(RANDOM_SOURCE),
        }),
    }),
    provide(DRAW_SCHEDULER, {
      factory: ({ inject }) => {
        const config = inject(APP_CONFIG);
        return createDrawScheduler({
          drawService: inject(DRAW_SERVICE),
          config,
          log: (message, detail) => {
            if (!config.logging.enabled) return;
            if (detail === undefined) console.log(`[draw] ${message}`);
            else console.log(`[draw] ${message}`, detail);
          },
        });
      },
    }),
    DrawRoutes,
  ],
  runnables: [
    ({ inject }) => {
      if (inject(APP_CONFIG).draw.enabled) inject(DRAW_SCHEDULER).start();
    },
  ],
});
