import type { AppConfig } from "../../core/config.providers";
import type { IDrawScheduler, IDrawService } from "./draw.types";

export interface DrawSchedulerDeps {
  drawService: IDrawService;
  config: AppConfig;
  log: (message: string, detail?: unknown) => void;
}

/**
 * `setInterval` is enough: the work is short, the draw is idempotent, and
 * `tick` is re-entrancy guarded. `unref()` stops the timer holding the
 * process (or `bun test`) open.
 */
export const createDrawScheduler = ({
  drawService,
  config,
  log,
}: DrawSchedulerDeps): IDrawScheduler => {
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;

  const tick = async (): Promise<void> => {
    if (ticking) return;
    ticking = true;
    try {
      const results = await drawService.runDueDraws();
      for (const result of results) {
        if (result.outcome !== "skipped") log("raffle draw completed", result);
      }
    } catch (error) {
      log("raffle draw tick failed", error);
    } finally {
      ticking = false;
    }
  };

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void tick(), config.draw.intervalMs);
      timer.unref?.();
      log(`draw scheduler started (every ${config.draw.intervalMs}ms)`);
      void tick();
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      log("draw scheduler stopped");
    },

    isRunning: () => timer !== null,
  };
};
