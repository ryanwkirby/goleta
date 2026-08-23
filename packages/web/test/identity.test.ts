import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  forgetIdentity,
  gamesFinished,
  gamesSeen,
  hasSeenRules,
  hasSeenSunny,
  loadHandSort,
  loadIdentity,
  loadName,
  markGamesSeen,
  markRulesSeen,
  markSunnySeen,
  recordGamesFinished,
  saveHandSort,
  saveIdentity,
  saveName,
  setWantsHints,
  wantsHints,
} from "../src/net/identity.ts";

/**
 * What this browser remembers, and what it does when it is not allowed to
 * remember anything. There is no login anywhere in this app, so `localStorage`
 * is the whole of identity.
 *
 * **The keys** are the contract with every browser that already has a value
 * under one: renaming one silently unseats everybody mid-game, so they are
 * asserted literally. **The failure** is that private browsing and a full quota
 * *throw* rather than returning null — seventeen guards, and not one was covered
 * before this file.
 *
 * The suite runs under `environment: "node"`, so the fake is a plain object,
 * which is better than a real one here: it can be made hostile on demand.
 */

const REAL = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

/** A working `localStorage`, backed by a Map. */
const workingStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
  };
};

/**
 * A browser that refuses. Private browsing in older Safari throws on write;
 * a full quota throws on write; a blocked-cookies origin throws on read too.
 * All three land in the same `catch`, so one hostile object covers the lot.
 */
const refuse = (): never => {
  throw new Error("SecurityError: the operation is insecure");
};

const hostileStorage = (): Storage => {
  return {
    get length(): number {
      return refuse();
    },
    clear: refuse,
    getItem: refuse,
    key: refuse,
    removeItem: refuse,
    setItem: refuse,
  };
};

const useStorage = (storage: Storage): void => {
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
};

beforeEach(() => useStorage(workingStorage()));

afterEach(() => {
  if (REAL) Object.defineProperty(globalThis, "localStorage", REAL);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

/** Reads a key straight out of the fake, bypassing the module under test. */
const raw = (key: string): string | null => globalThis.localStorage.getItem(key);

describe("the seat this browser holds", () => {
  it("round-trips a player id and token", () => {
    saveIdentity("abcd", { playerId: "p1", token: "secret" });
    expect(loadIdentity("abcd")).toEqual({ playerId: "p1", token: "secret" });
  });

  it("keys the seat by room code, case-insensitively", () => {
    // The Join screen lower-cases what people type and the room code is shown
    // upper-cased; both have to find the same seat.
    saveIdentity("abcd", { playerId: "p1", token: "secret" });
    expect(loadIdentity("ABCD")).toEqual({ playerId: "p1", token: "secret" });
    expect(raw("goleta:seat:ABCD")).toBe('{"playerId":"p1","token":"secret"}');
  });

  it("has no seat in a room it has never been in", () => {
    expect(loadIdentity("zzzz")).toBeNull();
  });

  it("treats a corrupted seat as no seat rather than throwing", () => {
    globalThis.localStorage.setItem("goleta:seat:ABCD", "{not json");
    expect(loadIdentity("abcd")).toBeNull();
  });

  it("drops the room's game bookmark along with the seat", () => {
    // Walking out of a room makes you a new arrival when you come back, and
    // games played in between were not yours. The two have to go together.
    saveIdentity("abcd", { playerId: "p1", token: "secret" });
    markGamesSeen("abcd", 4);
    forgetIdentity("abcd");
    expect(loadIdentity("abcd")).toBeNull();
    expect(gamesSeen("abcd")).toBeNull();
  });
});

describe("the name you play under", () => {
  it("round-trips", () => {
    saveName("Ryan");
    expect(loadName()).toBe("Ryan");
    expect(raw("goleta:name")).toBe("Ryan");
  });

  it("is empty before you have given one", () => {
    expect(loadName()).toBe("");
  });
});

describe("what this browser has already been shown", () => {
  it("has seen neither the rules nor the Sunny Rule to begin with", () => {
    expect(hasSeenRules()).toBe(false);
    expect(hasSeenSunny()).toBe(false);
  });

  it("remembers both once marked", () => {
    markRulesSeen();
    markSunnySeen();
    expect(hasSeenRules()).toBe(true);
    expect(hasSeenSunny()).toBe(true);
    expect(raw("goleta:rules-seen")).toBe("1");
    expect(raw("goleta:sunny-seen")).toBe("1");
  });

  it("reads anything other than the flag as not seen", () => {
    globalThis.localStorage.setItem("goleta:rules-seen", "yes");
    expect(hasSeenRules()).toBe(false);
  });
});

describe("games this browser has finished", () => {
  it("starts at none", () => {
    expect(gamesFinished()).toBe(0);
  });

  it("adds up, and reports the new total", () => {
    expect(recordGamesFinished(1)).toBe(1);
    expect(recordGamesFinished(2)).toBe(3);
    expect(gamesFinished()).toBe(3);
    expect(raw("goleta:games-finished")).toBe("3");
  });

  it("never counts backwards", () => {
    recordGamesFinished(2);
    expect(recordGamesFinished(-5)).toBe(2);
  });

  it("reads a junk or negative total as none", () => {
    globalThis.localStorage.setItem("goleta:games-finished", "banana");
    expect(gamesFinished()).toBe(0);
    globalThis.localStorage.setItem("goleta:games-finished", "-3");
    expect(gamesFinished()).toBe(0);
  });
});

describe("the bookmark in each room", () => {
  it("is null in a room this browser has never looked at", () => {
    // A starting line, not a score — and a different thing from having seen it
    // at zero. Arriving at a table three games in is not sitting through three.
    expect(gamesSeen("abcd")).toBeNull();
  });

  it("round-trips, including zero", () => {
    markGamesSeen("abcd", 0);
    expect(gamesSeen("abcd")).toBe(0);
    markGamesSeen("abcd", 7);
    expect(gamesSeen("abcd")).toBe(7);
    expect(raw("goleta:games-seen:ABCD")).toBe("7");
  });

  it("is keyed by room code, case-insensitively", () => {
    markGamesSeen("abcd", 2);
    expect(gamesSeen("ABCD")).toBe(2);
  });

  it("reads junk as never having looked", () => {
    globalThis.localStorage.setItem("goleta:games-seen:ABCD", "banana");
    expect(gamesSeen("abcd")).toBeNull();
  });
});

describe("your own preferences", () => {
  it("marks up your playable cards until you say otherwise", () => {
    // The kinder default, and the one #187 settled on: a preference you keep,
    // not a countdown that expires.
    expect(wantsHints()).toBe(true);
  });

  it("round-trips the hints preference both ways", () => {
    setWantsHints(false);
    expect(wantsHints()).toBe(false);
    setWantsHints(true);
    expect(wantsHints()).toBe(true);
  });

  it("keeps the key it has always had", () => {
    // What it stores changed in #187; the key deliberately did not, because a
    // browser with a value in here has already said something true about what
    // it wants and renaming it would throw that away.
    setWantsHints(false);
    expect(raw("goleta:first-game-hints")).toBe("0");
  });

  it("groups the hand by suit until you sort it", () => {
    expect(loadHandSort()).toBe("suit");
  });

  it("round-trips every sort", () => {
    saveHandSort("rank");
    expect(loadHandSort()).toBe("rank");
    saveHandSort("suit");
    expect(loadHandSort()).toBe("suit");
    saveHandSort("dealt");
    expect(loadHandSort()).toBe("dealt");
    expect(raw("goleta:hand-sort")).toBe("dealt");
  });

  it("reads an unknown sort as suit", () => {
    globalThis.localStorage.setItem("goleta:hand-sort", "sideways");
    expect(loadHandSort()).toBe("suit");
  });
});

/**
 * The whole reason the module is written the way it is.
 *
 * Every accessor has to survive a `localStorage` that throws on contact, and
 * has to fall back to the value a brand-new browser would get — never to
 * `undefined`, and never by letting the exception out into a render.
 */
describe("a browser that refuses to remember anything", () => {
  beforeEach(() => useStorage(hostileStorage()));

  it("reads every value as its fresh-browser default", () => {
    expect(loadIdentity("abcd")).toBeNull();
    expect(loadName()).toBe("");
    expect(hasSeenRules()).toBe(false);
    expect(hasSeenSunny()).toBe(false);
    expect(gamesFinished()).toBe(0);
    expect(gamesSeen("abcd")).toBeNull();
    expect(loadHandSort()).toBe("suit");
  });

  it("still gives you the hints, which is the kinder default", () => {
    expect(wantsHints()).toBe(true);
  });

  it("swallows every write rather than throwing into a render", () => {
    expect(() => saveIdentity("abcd", { playerId: "p1", token: "t" })).not.toThrow();
    expect(() => forgetIdentity("abcd")).not.toThrow();
    expect(() => saveName("Ryan")).not.toThrow();
    expect(() => markRulesSeen()).not.toThrow();
    expect(() => markSunnySeen()).not.toThrow();
    expect(() => markGamesSeen("abcd", 3)).not.toThrow();
    expect(() => setWantsHints(false)).not.toThrow();
    expect(() => saveHandSort("rank")).not.toThrow();
  });

  it("still reports a total from recordGamesFinished, uncounted though it is", () => {
    // Nothing is remembered, so nothing is ever counted, so the guardrails
    // stay on. The return value is still honest about the arithmetic it did.
    expect(recordGamesFinished(2)).toBe(2);
    expect(gamesFinished()).toBe(0);
  });
});
