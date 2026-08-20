/**
 * The goleta rules engine. Pure TypeScript: no I/O, no `Date.now()`, no
 * `Math.random()` — randomness is a seed carried in the game state, so a game
 * replays exactly from its intents. Imported by both the server and the browser
 * so the rules exist once. `docs/RULES.md` is canonical.
 */

export const ENGINE_VERSION = 1;

export * from "./types.ts";
export * from "./cards.ts";
export * from "./rules.ts";
export * from "./redact.ts";
export * from "./bot.ts";
export * from "./protocol.ts";
export { nextSeed, randomInt, shuffle } from "./rng.ts";
