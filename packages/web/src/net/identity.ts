/**
 * Who you are, as far as this browser is concerned.
 *
 * There are no accounts. A seat is a player id plus a secret token, kept here
 * so a reload, a locked phone or a redeploy doesn't cost you your hand.
 */

import type { HandSort } from "../lib/sort.ts";

export interface Identity {
  playerId: string;
  token: string;
}

const seatKey = (code: string): string => `goleta:seat:${code.toUpperCase()}`;
const NAME_KEY = "goleta:name";
const RULES_KEY = "goleta:rules-seen";

/**
 * The guard every accessor in this file used to write out for itself.
 *
 * `localStorage` does not politely return null when it is unavailable — it
 * *throws*. Private browsing, a full quota and an origin with storage blocked
 * all raise on contact, and one uncaught here is an exception thrown out of a
 * render. So every read falls back to whatever a brand-new browser would have
 * got, which is the same answer by a different route and is always the safe
 * one: no seat, no name, nothing seen, no games counted, and the hints left on.
 */
const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * The same guard for writes, where the consequence is worth naming once.
 *
 * A refused write means this browser remembers nothing, ever — so you cannot
 * reclaim your seat after a reload, your name is asked for again, the rules and
 * the Sunny explainer are offered every time, no game is ever counted as
 * finished, and the guardrails consequently never come off. Every one of those
 * is a degraded evening rather than a broken one, and none of them is worth an
 * error in front of somebody who is only trying to play a card. There is
 * nothing to tell them and nothing they could do about it.
 */
const writeLocal = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* nothing to be done — see above */
  }
};

const removeLocal = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to be done — see above */
  }
};

/**
 * A stored object, or null if it is missing, unreadable or unparseable.
 *
 * Two failures rather than one, which is why this keeps a `try` of its own:
 * storage refusing is `readLocal`'s problem, and a value that is there but is
 * not JSON is this one's. Both answer null.
 */
const readJson = <T>(key: string): T | null => {
  const raw = readLocal(key);
  if (raw === null) return null;
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const loadIdentity = (code: string): Identity | null => readJson<Identity>(seatKey(code));

export const saveIdentity = (code: string, identity: Identity): void =>
  writeLocal(seatKey(code), JSON.stringify(identity));

export const forgetIdentity = (code: string): void => {
  removeLocal(seatKey(code));
  // The bookmark goes with the seat. Coming back to a room you walked out of
  // makes you a new arrival, and games played in between were not yours.
  removeLocal(seenKey(code));
};

export const loadName = (): string => readLocal(NAME_KEY) ?? "";

export const saveName = (name: string): void => writeLocal(NAME_KEY, name);

export const hasSeenRules = (): boolean => readLocal(RULES_KEY) === "1";

export const markRulesSeen = (): void => writeLocal(RULES_KEY, "1");

const GAMES_KEY = "goleta:games-finished";

/**
 * How many games this browser has seen through to the end.
 *
 * It used to decide whether the table still marked up your playable cards. It
 * does not any more (#187): that is a preference you set and keep. What the
 * count decides now is one thing, once — whether to *ask* you, after your first
 * finished game, whether you want to keep the help. See `Graduation`.
 */
export const gamesFinished = (): number => {
  const raw = Number(readLocal(GAMES_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

/** Returns the new count, so a caller can notice the first one going by. */
export const recordGamesFinished = (games: number): number => {
  const next = gamesFinished() + Math.max(games, 0);
  writeLocal(GAMES_KEY, String(next));
  return next;
};

const seenKey = (code: string): string => `goleta:games-seen:${code.toUpperCase()}`;

/**
 * How many games this room had finished the last time this browser looked.
 *
 * The count above used to move only when a screen happened to be mounted at
 * the instant a `gameOver` event arrived — and the event log starts empty on
 * every page load, so a reload, a force-quit, a socket that dropped and came
 * back after the hand, or a rejoin from a new tab all left it at zero. The
 * training wheels then stayed on for the second game, and the third (#184).
 *
 * `room.gamesPlayed` is durable: the server owns it, every `RoomView` carries
 * it, and it survives a reload, a reconnect and a redeploy. So the count moves
 * when the *room* says a game finished, and this is the bookmark that keeps
 * each one counted exactly once.
 *
 * `null` means this browser has never seen this room, which is a different
 * thing from having seen it at zero: arriving at a table three games in is not
 * the same as sitting through three games, and only the second is yours.
 */
export const gamesSeen = (code: string): number | null => {
  const raw = readLocal(seenKey(code));
  if (raw === null) return null;
  const seen = Number(raw);
  return Number.isFinite(seen) && seen >= 0 ? seen : null;
};

/**
 * How many of a room's finished games this browser gets credit for.
 *
 * The whole rule of #184 in one place, and the reason it is a function rather
 * than two comparisons at the call site: the two mistakes it is between are
 * opposites, and both were live. Under-counting is the bug — a first game that
 * ended while the phone was away left the training wheels on for the second.
 * Over-counting is the one the old code was careful about and this has to stay
 * careful about: coming back to a room whose game has already finished must
 * not count it a second time.
 *
 * A room never seen before is a starting line, not a score. Somebody who walks
 * up to a table three games in has finished none of them, and neither has a
 * watcher who has been sitting there all evening — the bookmark moves for them
 * too, so taking a seat starts the count from where they sat down.
 */
export const gamesToCredit = (seen: number | null, played: number): number =>
  seen === null ? 0 : Math.max(played - seen, 0);

export const markGamesSeen = (code: string, played: number): void =>
  writeLocal(seenKey(code), String(played));

// The key keeps its old name. What it stores changed in #187 — a standing
// preference rather than an answer about one game — but a browser that already
// has a value in here has said something true about what it wants, and
// renaming the key would throw that away to make a comment read better.
const HINTS_KEY = "goleta:first-game-hints";

/**
 * Whether the table marks up your playable cards.
 *
 * **A setting, not a countdown** (#187). It used to be an answer given once, on
 * the way in, before you had seen a card: it ran for exactly one game, and then
 * stopped, and you were told it had stopped. At no point did anybody choose to
 * keep it or to give it up.
 *
 * So it is a preference now, read live, changed from your own cog at any time —
 * and read live is the whole of the change here as far as this file is
 * concerned. It is still a value in `localStorage` next to the seat tokens,
 * still no account anywhere, and clearing it still just means you get the
 * guardrails again.
 *
 * The bargain of #33 survives intact and is enforced elsewhere: taking help is
 * never quiet. Switching this on is announced to the table and marks your seat
 * for as long as it lasts, so nobody can quietly stop being catchable. What is
 * gone is only the expiry.
 */
export const wantsHints = (): boolean => readLocal(HINTS_KEY) !== "0";

export const setWantsHints = (wanted: boolean): void =>
  writeLocal(HINTS_KEY, wanted ? "1" : "0");

const SORT_KEY = "goleta:hand-sort";

/**
 * How you like your hand arranged. Kept because having to set it again every
 * time you reload is exactly the sort of small annoyance nobody reports.
 */
export const loadHandSort = (): HandSort => {
  const raw = readLocal(SORT_KEY);
  return raw === "rank" || raw === "suit" ? raw : "dealt";
};

export const saveHandSort = (sort: HandSort): void => writeLocal(SORT_KEY, sort);

/*
 * There is no `goleta:table-view` any more. Which way you are looking at an IRL
 * table was a stored preference for as long as the two views were swapped by
 * tapping words in a corner; the phone holds it now — sideways is your hand,
 * upright is the whole table — and a preference the device is already
 * expressing is not one worth writing down.
 */

const SUNNY_KEY = "goleta:sunny-seen";

/** The Sunny Rule is taught by being used, so we only explain it once. */
export const hasSeenSunny = (): boolean => readLocal(SUNNY_KEY) === "1";

export const markSunnySeen = (): void => writeLocal(SUNNY_KEY, "1");
