import { createProviderToken } from "difunkt";

// Injected rather than used directly so tests can freeze time, fix ids and
// script the draw.

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface RandomSource {
  /** An integer in `[0, maxExclusive)`. */
  int(maxExclusive: number): number;
}

export const CLOCK = createProviderToken<Clock>("core.clock");
export const ID_GENERATOR = createProviderToken<IdGenerator>("core.idGenerator");
export const RANDOM_SOURCE = createProviderToken<RandomSource>("core.randomSource");
