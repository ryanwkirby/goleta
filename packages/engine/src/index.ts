/**
 * The goleta rules engine.
 *
 * Pure TypeScript: no I/O, no `Date.now()`, no `Math.random()`. Every source of
 * randomness is injected and recorded, so any game replays exactly from its
 * event stream. Imported by both the server (which runs it authoritatively) and
 * the browser (which runs it to render legal moves), so the rules exist once.
 *
 * The rules themselves live in `docs/RULES.md` and that document is canonical.
 */

export const ENGINE_VERSION = 1;
