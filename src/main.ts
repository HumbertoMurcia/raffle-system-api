import { createApplication } from "difunkt";
import { AppModule } from "./app.module";
import { APP_CONFIG } from "./core/config.providers";
import { DATABASE } from "./core/database/database.providers";
import { DRAW_SCHEDULER } from "./features/draw/draw.providers";
import { HttpApp } from "./http/http.module";

const resolve = await createApplication(AppModule);

const config = resolve(APP_CONFIG);
const app = resolve(HttpApp).listen(config.port);

console.log(`Raffle API listening on http://localhost:${config.port}`);

const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n${signal} received, shutting down`);
  resolve(DRAW_SCHEDULER).stop();
  await app.stop();
  resolve(DATABASE).close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
