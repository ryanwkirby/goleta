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

const readJson = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const loadIdentity = (code: string): Identity | null => readJson<Identity>(seatKey(code));

export const saveIdentity = (code: string, identity: Identity): void => {
  try {
    localStorage.setItem(seatKey(code), JSON.stringify(identity));
  } catch {
    // Private browsing, or a full quota. You just can't reclaim your seat.
  }
};

export const forgetIdentity = (code: string): void => {
  try {
    localStorage.removeItem(seatKey(code));
    // The bookmark goes with the seat. Coming back to a room you walked out of
    // makes you a new arrival, and games played in between were not yours.
    localStorage.removeItem(seenKey(code));
  } catch {
    /* nothing to be done */
  }
};

export const loadName = (): string => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

export const saveName = (name: string): void => {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* nothing to be done */
  }
};

export const hasSeenRules = (): boolean => {
  try {
    return localStorage.getItem(RULES_KEY) === "1";
  } catch {
    return false;
  }
};

export const markRulesSeen = (): void => {
  try {
    localStorage.setItem(RULES_KEY, "1");
  } catch {
    /* nothing to be done */
  }
};

const GAMES_KEY = "goleta:games-finished";

/**
 * How many games this browser has seen through to the end.
 *
 * It decides one thing: whether the table still marks up your playable cards
 * for you. It does that until your first game is over, and then stops — see
 * `AGENTS.md`. Still no accounts; this is a number in `localStorage` next to
 * the seat tokens, and clearing it just means you get the guardrails again.
 */
export const gamesFinished = (): number => {
  try {
    const raw = Number(localStorage.getItem(GAMES_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
};

/** Returns the new count, so a caller can notice the first one going by. */
export const recordGamesFinished = (games: number): number => {
  const next = gamesFinished() + Math.max(games, 0);
  try {
    localStorage.setItem(GAMES_KEY, String(next));
  } catch {
    // Private browsing. The guardrails just never come off.
  }
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
  try {
    const raw = localStorage.getItem(seenKey(code));
    if (raw === null) return null;
    const seen = Number(raw);
    return Number.isFinite(seen) && seen >= 0 ? seen : null;
  } catch {
    return null;
  }
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

export const markGamesSeen = (code: string, played: number): void => {
  try {
    localStorage.setItem(seenKey(code), String(played));
  } catch {
    // Private browsing, again — and it fails the same kind way. Nothing is
    // remembered, so nothing is ever counted, so the guardrails stay on.
  }
};

const HINTS_KEY = "goleta:first-game-hints";

/**
 * Whether you asked for the training wheels on the way in.
 *
 * Offered once, on the rules screen, before your first game. Anyone who saw the
 * rules before that choice existed gets them, which is what they'd have had.
 */
export const wantsFirstGameHints = (): boolean => {
  try {
    return localStorage.getItem(HINTS_KEY) !== "0";
  } catch {
    return true;
  }
};

export const setFirstGameHints = (wanted: boolean): void => {
  try {
    localStorage.setItem(HINTS_KEY, wanted ? "1" : "0");
  } catch {
    // Private browsing. You get the hints, which is the kinder default.
  }
};

const SORT_KEY = "goleta:hand-sort";

/**
 * How you like your hand arranged. Kept because having to set it again every
 * time you reload is exactly the sort of small annoyance nobody reports.
 */
export const loadHandSort = (): HandSort => {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    return raw === "rank" || raw === "suit" ? raw : "dealt";
  } catch {
    return "dealt";
  }
};

export const saveHandSort = (sort: HandSort): void => {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    /* nothing to be done */
  }
};

/*
 * There is no `goleta:table-view` any more. Which way you are looking at an IRL
 * table was a stored preference for as long as the two views were swapped by
 * tapping words in a corner; the phone holds it now — sideways is your hand,
 * upright is the whole table — and a preference the device is already
 * expressing is not one worth writing down.
 */

const SUNNY_KEY = "goleta:sunny-seen";

/** The Sunny Rule is taught by being used, so we only explain it once. */
export const hasSeenSunny = (): boolean => {
  try {
    return localStorage.getItem(SUNNY_KEY) === "1";
  } catch {
    return false;
  }
};

export const markSunnySeen = (): void => {
  try {
    localStorage.setItem(SUNNY_KEY, "1");
  } catch {
    /* nothing to be done */
  }
};
