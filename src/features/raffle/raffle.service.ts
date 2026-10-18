import { NotFoundError } from "../../core/errors";
import type { IRaffleRepository, IRaffleService } from "./raffle.types";

/**
 * Raffles are public. `draft` and `cancelled` ones stay reachable by id on
 * purpose, so a link shared early resolves to a meaningful status.
 */
export const createRaffleService = (raffles: IRaffleRepository): IRaffleService => ({
  async list(status) {
    return raffles.list(status);
  },

  async getById(id) {
    const raffle = raffles.findById(id);
    if (!raffle) throw new NotFoundError("Raffle", id);
    return raffle;
  },
});
