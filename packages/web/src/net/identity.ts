/**
 * Who you are, as far as this browser is concerned. There are no accounts: a
 * seat is a player id plus a secret token, kept here so a reload, a locked phone
 * or a redeploy doesn't cost you your hand.
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
 * `localStorage` does not politely return null when it is unavailable — it
 * *throws*, and private browsing, a full quota and a blocked origin all raise on
 * contact. So every read falls back to whatever a brand-new browser would have
 * got, which is always the safe answer.
 */
const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * The same guard for writes. A refused write means this browser remembers
 * nothing, ever — no reclaimed seat, no name, the explainers offered every time,
 * no game ever counted. Every one of those is a degraded evening rather than a
 * broken one, and none is worth an error in front of somebody trying to play a
 * card.
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

/** Two failures rather than one, which is why this keeps a `try` of its own:
 * storage refusing is `readLocal`'s problem, and a value that is there but is
 * not JSON is this one's. */
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
  // The bookmark goes with the seat: coming back to a room you walked out of makes
  // you a new arrival, and games played in between were not yours.
  removeLocal(seenKey(code));
};

export const loadName = (): string => readLocal(NAME_KEY) ?? "";

export const saveName = (name: string): void => writeLocal(NAME_KEY, name);

export const hasSeenRules = (): boolean => readLocal(RULES_KEY) === "1";

export const markRulesSeen = (): void => writeLocal(RULES_KEY, "1");

const GAMES_KEY = "goleta:games-finished";

/**
 * How many games this browser has seen through to the end. It used to decide
 * whether the table marked up your playable cards; since #187 that is a
 * preference you set and keep, and this decides one thing once — whether to
 * *ask*, after your first finished game, if you want to keep the help.
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
 * The count above used to move only when a screen happened to be mounted as a
 * `gameOver` arrived, so a reload or a dropped socket left it at zero and the
 * training wheels stayed on for the second game (#184). `room.gamesPlayed` is
 * durable, and this is the bookmark that keeps each game counted exactly once.
 *
 * `null` means this browser has never seen this room, which is different from
 * having seen it at zero: arriving at a table three games in is not the same as
 * sitting through three games.
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
 * A function rather than two comparisons at the call site because the two
 * mistakes it is between are opposites and both were live: under-counting left
 * the training wheels on for a second game (#184), and over-counting would
 * credit a room whose game had already finished a second time. A room never seen
 * before is a starting line, not a score.
 */
export const gamesToCredit = (seen: number | null, played: number): number =>
  seen === null ? 0 : Math.max(played - seen, 0);

export const markGamesSeen = (code: string, played: number): void =>
  writeLocal(seenKey(code), String(played));

// The key keeps its old name. What it stores changed in #187 — a standing
// preference rather than an answer about one game — but a browser that already
// has a value in here has said something true about what it wants.
const HINTS_KEY = "goleta:first-game-hints";

/**
 * Whether the table marks up your playable cards. **A setting, not a countdown**
 * (#187): it used to be an answer given once, before you had seen a card, that
 * ran for one game and then stopped. Now it is read live and changed from your
 * own cog at any time.
 *
 * The bargain of #33 survives and is enforced elsewhere: taking help is never
 * quiet, so nobody can silently stop being catchable. What is gone is the expiry.
 */
export const wantsHints = (): boolean => readLocal(HINTS_KEY) !== "0";

export const setWantsHints = (wanted: boolean): void =>
  writeLocal(HINTS_KEY, wanted ? "1" : "0");

const SORT_KEY = "goleta:hand-sort";

/** Kept because having to set it again every reload is exactly the sort of
 * small annoyance nobody reports. */
export const loadHandSort = (): HandSort => {
  const raw = readLocal(SORT_KEY);
  return raw === "rank" || raw === "suit" ? raw : "dealt";
};

export const saveHandSort = (sort: HandSort): void => writeLocal(SORT_KEY, sort);

/*
 * There is no `goleta:table-view` any more. Which way you are looking at an IRL
 * table was a stored preference while the two views were swapped by tapping
 * words in a corner; the phone holds it now, and a preference the device is
 * already expressing is not one worth writing down.
 */

const SUNNY_KEY = "goleta:sunny-seen";

/** The Sunny Rule is taught by being used, so we only explain it once. */
export const hasSeenSunny = (): boolean => readLocal(SUNNY_KEY) === "1";

export const markSunnySeen = (): void => writeLocal(SUNNY_KEY, "1");
