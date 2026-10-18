import { createModule } from "difunkt";
import { AuthPlugin } from "./auth.plugin";
import { ErrorHandlerPlugin } from "./error-handler.plugin";
import { LoggerPlugin } from "./logger.plugin";

export const PluginsModule = createModule({
  providers: [ErrorHandlerPlugin, LoggerPlugin, AuthPlugin],
});
