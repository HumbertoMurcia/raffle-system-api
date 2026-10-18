/**
 * The scheduler owns the only mutable lifecycle in the app, so its guards are
 * tested directly: an immediate first tick, no overlap, no second timer, and
 * a failure that does not kill the loop.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createApplication, provide } from "difunkt";
import { APP_CONFIG } from "../src/core/config.providers";
import { DrawModule } from "../src/features/draw/draw.module";
import { DRAW_SCHEDULER, DRAW_SERVICE } from "../src/features/draw/draw.providers";
import { createDrawScheduler } from "../src/features/draw/draw.scheduler";
import type { DrawResult, IDrawScheduler, IDrawService } from "../src/features/draw/draw.types";
import { testConfig } from "./helpers/fakes";

const drawn = (raffleId: string): DrawResult => ({
  raffleId,
  outcome: "drawn",
  winningTicketId: "tkt_1",
  winnerUserId: "usr_1",
});

const skipped = (raffleId: string): DrawResult => ({
  raffleId,
  outcome: "skipped",
  winningTicketId: null,
  winnerUserId: null,
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const started: IDrawScheduler[] = [];
afterEach(() => {
  while (started.length) started.pop()?.stop();
});

/** A long interval keeps a test deterministic; only the overlap test needs a short one. */
const buildScheduler = (
  runDueDraws: () => Promise<DrawResult[]>,
  intervalMs = 60_000,
) => {
  let calls = 0;
  const logs: string[] = [];
  const drawService: IDrawService = {
    runDueDraws: () => {
      calls += 1;
      return runDueDraws();
    },
    drawRaffle: async () => skipped("raf_1"),
  };

  const scheduler = createDrawScheduler({
    drawService,
    config: testConfig({ draw: { enabled: true, intervalMs } }),
    log: (message) => logs.push(message),
  });
  started.push(scheduler);

  return { scheduler, logs, calls: () => calls };
};

describe("draw scheduler", () => {
  test("draws once immediately, without waiting out the first interval", async () => {
    const { scheduler, calls } = buildScheduler(async () => []);

    expect(calls()).toBe(0);
    scheduler.start();

    expect(calls()).toBe(1);
    expect(scheduler.isRunning()).toBe(true);
  });

  test("starting an already running scheduler does not add a second timer", async () => {
    const { scheduler, calls } = buildScheduler(async () => []);

    scheduler.start();
    scheduler.start();
    scheduler.start();

    expect(calls()).toBe(1);
    expect(scheduler.isRunning()).toBe(true);
  });

  test("stopping halts further ticks", async () => {
    const { scheduler, calls } = buildScheduler(async () => [], 1);

    scheduler.start();
    scheduler.stop();
    const atStop = calls();

    await wait(25);

    expect(scheduler.isRunning()).toBe(false);
    expect(calls()).toBe(atStop);
  });

  test("stopping a scheduler that never started is harmless", () => {
    const { scheduler } = buildScheduler(async () => []);

    expect(() => scheduler.stop()).not.toThrow();
    expect(scheduler.isRunning()).toBe(false);
  });

  test("can be restarted after being stopped", async () => {
    const { scheduler, calls } = buildScheduler(async () => []);

    scheduler.start();
    await wait(5);
    scheduler.stop();
    scheduler.start();

    expect(calls()).toBe(2);
    expect(scheduler.isRunning()).toBe(true);
  });

  // stop() does not abort a draw already in flight, so the re-entrancy guard
  // suppresses the immediate tick of an instant restart. The interval picks it
  // up on the next pass, so the scheduler recovers on its own.
  test("restarting mid-draw skips the immediate tick but recovers", async () => {
    let release = () => {};
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { scheduler, calls } = buildScheduler(async () => {
      await inFlight;
      return [];
    }, 1);

    scheduler.start();
    scheduler.stop();
    scheduler.start();

    expect(calls()).toBe(1);

    release();
    await wait(25);

    expect(calls()).toBeGreaterThan(1);
  });

  // The re-entrancy guard is the reason a slow draw cannot pile up: with a 1ms
  // interval, ~20 ticks fire while the first one is still awaiting.
  test("a tick that overlaps a running draw is skipped, and resumes afterwards", async () => {
    let release = () => {};
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { scheduler, calls } = buildScheduler(async () => {
      await inFlight;
      return [];
    }, 1);

    scheduler.start();
    await wait(25);

    expect(calls()).toBe(1);

    release();
    await wait(25);

    expect(calls()).toBeGreaterThan(1);
  });

  test("a failing draw is logged and leaves the scheduler running", async () => {
    const { scheduler, logs } = buildScheduler(async () => {
      throw new Error("database is gone");
    });

    scheduler.start();
    await wait(5);

    expect(logs.some((line) => line.includes("failed"))).toBe(true);
    expect(scheduler.isRunning()).toBe(true);
  });

  test("logs raffles it drew and stays quiet about the ones it skipped", async () => {
    const { scheduler, logs } = buildScheduler(async () => [
      drawn("raf_1"),
      skipped("raf_2"),
      skipped("raf_3"),
    ]);

    scheduler.start();
    await wait(5);

    expect(logs.filter((line) => line.includes("completed"))).toHaveLength(1);
  });
});

describe("draw scheduler lifecycle in DrawModule", () => {
  const buildModule = (enabled: boolean) =>
    createApplication(DrawModule, {
      providers: [
        provide(APP_CONFIG, {
          value: testConfig({ draw: { enabled, intervalMs: 60_000 } }),
        }),
        provide(DRAW_SERVICE, {
          value: {
            runDueDraws: async () => [],
            drawRaffle: async () => skipped("raf_1"),
          } satisfies IDrawService,
        }),
      ],
    });

  test("the module runnable starts the scheduler when the draw is enabled", async () => {
    const resolve = await buildModule(true);
    const scheduler = resolve(DRAW_SCHEDULER);
    started.push(scheduler);

    expect(scheduler.isRunning()).toBe(true);
  });

  // How the test suite avoids background timers, and how a second instance
  // would be deployed without one.
  test("the scheduler stays idle when the draw is disabled", async () => {
    const resolve = await buildModule(false);
    const scheduler = resolve(DRAW_SCHEDULER);
    started.push(scheduler);

    expect(scheduler.isRunning()).toBe(false);
  });
});
