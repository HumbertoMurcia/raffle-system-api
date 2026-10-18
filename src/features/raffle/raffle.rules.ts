// Pure domain rules: the single place that answers "may this happen?".
import {
  InvalidPurchaseQuantityError,
  NotEnoughTicketsError,
  RaffleDrawDatePassedError,
  RaffleNotActiveError,
} from "../../core/errors";
import type { IRaffle } from "./raffle.types";

export const ticketsRemaining = (raffle: IRaffle): number =>
  raffle.maxTickets - raffle.ticketsSold;

export const isOpenForPurchase = (raffle: IRaffle, now: Date): boolean =>
  raffle.status === "active" && raffle.drawDate.getTime() > now.getTime();

export const isDueForDraw = (raffle: IRaffle, now: Date): boolean =>
  raffle.status === "active" && raffle.drawDate.getTime() <= now.getTime();

export const purchaseCost = (raffle: IRaffle, quantity: number): number =>
  raffle.ticketPrice * quantity;

/** Throws the first violated rule, most specific reason first. */
export const assertPurchaseAllowed = (
  raffle: IRaffle,
  quantity: number,
  now: Date,
  maxTicketsPerPurchase: number,
): void => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxTicketsPerPurchase) {
    throw new InvalidPurchaseQuantityError(quantity, maxTicketsPerPurchase);
  }
  if (raffle.status !== "active") {
    throw new RaffleNotActiveError(raffle.id, raffle.status);
  }
  if (raffle.drawDate.getTime() <= now.getTime()) {
    throw new RaffleDrawDatePassedError(raffle.id, raffle.drawDate);
  }
  const remaining = ticketsRemaining(raffle);
  if (quantity > remaining) {
    throw new NotEnoughTicketsError(raffle.id, quantity, remaining);
  }
};
