/**
 * A tiny xorshift32 PRNG. The engine never touches `Math.random` — every shuffle
 * comes from a seed in the game state, so a game replays exactly from its
 * intents, which is what the simulations and crash recovery stand on.
 *
 * Not cryptographic and doesn't need to be, but it is the *only* source of
 * shuffle order, so it must not be seeded with something a player could guess.
 */

/** Advances the seed. Never returns 0, which would be a fixed point. */
export const nextSeed = (seed: number): number => {
  let x = seed | 0;
  if (x === 0) x = 0x9e3779b9;
  x ^= x << 13;
  x |= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  return x | 0;
};

/** A uniform integer in `[0, bound)`, plus the seed to carry forward. */
export const randomInt = (seed: number, bound: number): [value: number, seed: number] => {
  if (bound <= 1) return [0, nextSeed(seed)];
  const next = nextSeed(seed);
  // Biased by at most 2^-32 per draw, far below anything that matters here.
  return [(next >>> 0) % bound, next];
};

/** Fisher-Yates, pure: returns a new array and the seed to carry forward. */
export const shuffle = <T>(items: readonly T[], seed: number): [shuffled: T[], seed: number] => {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = randomInt(s, i + 1);
    s = next;
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return [out, s];
};
