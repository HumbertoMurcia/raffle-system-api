import { createModule } from "difunkt";
import { CoreModule } from "./core/core.module";
import { AuthModule } from "./features/auth/auth.module";
import { DrawModule } from "./features/draw/draw.module";
import { RaffleModule } from "./features/raffle/raffle.module";
import { TicketModule } from "./features/ticket/ticket.module";
import { UserModule } from "./features/user/user.module";
import { HttpModule } from "./http/http.module";
import { PluginsModule } from "./plugins/plugins.module";

/**
 * Flat modules, not hierarchical: one shared container keeps cross-feature
 * dependencies explicit at the token level, and lets a test override any
 * provider in the tree via `createApplication(AppModule, { providers })`.
 *
 * Import order is runnable order: CoreModule migrates and seeds before
 * DrawModule starts the scheduler.
 */
export const AppModule = createModule({
  imports: [
    CoreModule,
    PluginsModule,
    UserModule,
    AuthModule,
    RaffleModule,
    TicketModule,
    DrawModule,
    HttpModule,
  ],
});
