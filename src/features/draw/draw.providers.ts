import { createProviderToken } from "difunkt";
import type { IDrawScheduler, IDrawService } from "./draw.types";

export const DRAW_SERVICE = createProviderToken<IDrawService>("draw.service");
export const DRAW_SCHEDULER = createProviderToken<IDrawScheduler>("draw.scheduler");
