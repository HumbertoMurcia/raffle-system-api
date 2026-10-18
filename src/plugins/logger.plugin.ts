import { Elysia } from "elysia";
import { createProvider } from "difunkt";
import { APP_CONFIG } from "../core/config.providers";

/**
 * Method and path are captured in `derive`: by `onAfterResponse` Elysia has
 * recycled parts of the context and `request.url` is empty. The hooks are
 * always installed so the plugin keeps one stable type.
 */
export const LoggerPlugin = createProvider(({ inject }) => {
  const config = inject(APP_CONFIG);

  return new Elysia({ name: "plugin.logger" })
    .derive({ as: "global" }, ({ request, path }) => ({
      requestLog: { startedAt: performance.now(), method: request.method, path },
    }))
    .onAfterResponse({ as: "global" }, ({ set, requestLog }) => {
      if (!config.logging.enabled) return;
      // Elysia skips `derive` when no route matched.
      if (!requestLog) return;

      const ms = (performance.now() - requestLog.startedAt).toFixed(1);
      console.log(`${requestLog.method} ${requestLog.path} ${set.status ?? 200} ${ms}ms`);
    });
});
