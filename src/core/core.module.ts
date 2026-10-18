import { createModule } from "difunkt";
import { ConfigModule } from "./config.module";
import { PlatformModule } from "./platform.module";
import { DatabaseModule } from "./database/database.module";
import { IdempotencyModule } from "./idempotency/idempotency.module";

/** Imported first so migration and seeding run before any feature runnable. */
export const CoreModule = createModule({
  imports: [ConfigModule, PlatformModule, DatabaseModule, IdempotencyModule],
});
