/**
 * The goleta rules engine.
 *
 * Pure TypeScript: no I/O, no `Date.now()`, no `Math.random()`. Every source of
 * randomness is a seed carried in the game state, so a game replays exactly
 * from its intents. Imported by both the server (which runs it authoritatively)
 * and the browser (which runs it to render legal moves), so the rules exist
 * once.
 *
 * `docs/RULES.md` is canonical; this package implements it.
 */

export const ENGINE_VERSION = 1;

export * from "./types.ts";
export * from "./cards.ts";
export * from "./rules.ts";
export { nextSeed, randomInt, shuffle } from "./rng.ts";
