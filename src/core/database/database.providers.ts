import type { Database } from "bun:sqlite";
import { createProviderToken } from "difunkt";

/**
 * Commits on return, rolls back if `work` throws. The callback is synchronous
 * because bun:sqlite is: an `await` inside a transaction would not be atomic.
 */
export interface UnitOfWork {
  transaction<T>(work: () => T): T;
}

export const DATABASE = createProviderToken<Database>("core.database");
export const UNIT_OF_WORK = createProviderToken<UnitOfWork>("core.unitOfWork");
