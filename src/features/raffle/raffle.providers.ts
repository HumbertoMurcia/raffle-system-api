import { createProviderToken } from "difunkt";
import type { IRaffleRepository, IRaffleService } from "./raffle.types";

export const RAFFLE_REPOSITORY = createProviderToken<IRaffleRepository>("raffle.repository");
export const RAFFLE_SERVICE = createProviderToken<IRaffleService>("raffle.service");
