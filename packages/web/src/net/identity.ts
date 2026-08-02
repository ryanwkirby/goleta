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
export const recordGameFinished = (): number => {
  const next = gamesFinished() + 1;
  try {
    localStorage.setItem(GAMES_KEY, String(next));
  } catch {
    // Private browsing. The guardrails just never come off.
  }
  return next;
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
