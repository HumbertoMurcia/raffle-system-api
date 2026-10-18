import { createApplication, provide, type ModuleProviderList } from "difunkt";
import { AppModule } from "../../src/app.module";
import { APP_CONFIG } from "../../src/core/config.providers";
import { CLOCK, ID_GENERATOR, RANDOM_SOURCE } from "../../src/core/platform.providers";
import { createScriptedRandom, createSequentialIds, fixedClock, testConfig } from "./fakes";

const TEST_NOW = new Date("2026-01-15T12:00:00.000Z");

/**
 * The real application against an in-memory database, with time, ids and
 * randomness replaced. `createApplication`'s `providers` option overrides any
 * provider in the tree by token, so nothing in `src/` changes for tests.
 */
export const createTestApp = (overrides: ModuleProviderList[] = []) =>
  createApplication(AppModule, {
    providers: [
      provide(APP_CONFIG, { value: testConfig() }),
      provide(CLOCK, { value: fixedClock(TEST_NOW) }),
      provide(ID_GENERATOR, { value: createSequentialIds("test") }),
      provide(RANDOM_SOURCE, { value: createScriptedRandom(0) }),
      ...overrides,
    ],
  });
