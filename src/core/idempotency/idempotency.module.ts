import { createModule, provide } from "difunkt";
import { DATABASE } from "../database/database.providers";
import { IDEMPOTENCY_STORE } from "./idempotency.providers";
import { createSqliteIdempotencyStore } from "./idempotency.repository";

export const IdempotencyModule = createModule({
  providers: [
    provide(IDEMPOTENCY_STORE, {
      factory: ({ inject }) => createSqliteIdempotencyStore(inject(DATABASE)),
    }),
  ],
});
