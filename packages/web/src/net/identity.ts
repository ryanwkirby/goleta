/**
 * Who you are, as far as this browser is concerned.
 *
 * There are no accounts. A seat is a player id plus a secret token, kept here
 * so a reload, a locked phone or a redeploy doesn't cost you your hand.
 */

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
