import { createModule, provide } from "difunkt";
import {
  CLOCK,
  ID_GENERATOR,
  RANDOM_SOURCE,
  type Clock,
  type IdGenerator,
  type RandomSource,
} from "./platform.providers";

const systemClock: Clock = {
  now: () => new Date(),
};

const uuidGenerator: IdGenerator = {
  next: () => crypto.randomUUID(),
};

const cryptoRandomSource: RandomSource = {
  int: (maxExclusive) => {
    if (maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be greater than 0");
    }
    // Rejection sampling keeps the distribution uniform.
    const limit = Math.floor(0xffff_ffff / maxExclusive) * maxExclusive;
    const buffer = new Uint32Array(1);
    let value: number;
    do {
      crypto.getRandomValues(buffer);
      value = buffer[0] as number;
    } while (value >= limit);
    return value % maxExclusive;
  },
};

export const PlatformModule = createModule({
  providers: [
    provide(CLOCK, { value: systemClock }),
    provide(ID_GENERATOR, { value: uuidGenerator }),
    provide(RANDOM_SOURCE, { value: cryptoRandomSource }),
  ],
});
