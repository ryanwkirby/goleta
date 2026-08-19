import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { creditFinishedGames, shouldAskAboutHints } from "../src/lib/graduation.ts";
import { gamesFinished, gamesSeen } from "../src/net/identity.ts";

/**
 * The bookkeeping behind #184, tested end to end rather than in its arithmetic
 * alone — which the `localStorage` stub from #223 is what makes possible.
 *
 * The two ways of getting this wrong are opposites and both were live at one
 * point. Under-counting was the reported bug: a first game that ended while the
 * phone was away left the training wheels on for the second. Over-counting is
 * the one the old code was careful about, and this has to stay careful about it.
 */

const REAL = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

beforeEach(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key: string) => data.get(key) ?? null,
      key: (index: number) => [...data.keys()][index] ?? null,
      removeItem: (key: string) => void data.delete(key),
      setItem: (key: string, value: string) => void data.set(key, String(value)),
    } satisfies Storage,
  });
});

afterEach(() => {
  if (REAL) Object.defineProperty(globalThis, "localStorage", REAL);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("whether to ask about keeping the highlights", () => {
  it("asks after a first finished game", () => {
    expect(shouldAskAboutHints(0, 1, true)).toBe(true);
  });

  it("never asks again after that", () => {
    expect(shouldAskAboutHints(1, 2, true)).toBe(false);
  });

  it("does not ask somebody who never took the highlights", () => {
    // Nothing is being offered back to a player who turned them off already.
    expect(shouldAskAboutHints(0, 1, false)).toBe(false);
  });
});

describe("crediting the games a browser sat through", () => {
  it("credits nothing on first arrival, and leaves a starting line", () => {
    // A room never seen before is a starting line, not a score. Somebody who
    // walks up to a table three games in has finished none of them.
    expect(creditFinishedGames("abcd", 3, true, true)).toBe(false);
    expect(gamesFinished()).toBe(0);
    expect(gamesSeen("abcd")).toBe(3);
  });

  it("asks after the browser's genuine first finished game", () => {
    creditFinishedGames("abcd", 0, true, true);
    expect(creditFinishedGames("abcd", 1, true, true)).toBe(true);
    expect(gamesFinished()).toBe(1);
  });

  it("does not ask twice", () => {
    creditFinishedGames("abcd", 0, true, true);
    creditFinishedGames("abcd", 1, true, true);
    expect(creditFinishedGames("abcd", 2, true, true)).toBe(false);
    expect(gamesFinished()).toBe(2);
  });

  it("does not count the same game twice on the way back to a finished room", () => {
    creditFinishedGames("abcd", 0, true, true);
    creditFinishedGames("abcd", 1, true, true);
    expect(creditFinishedGames("abcd", 1, true, true)).toBe(false);
    expect(gamesFinished()).toBe(1);
  });

  it("counts a game that finished while this browser was away", () => {
    // The reported bug (#184). The phone was seated when the room was at 0 and
    // looked again when it was at 1; what it did in between is not the point.
    creditFinishedGames("abcd", 0, true, true);
    expect(creditFinishedGames("abcd", 1, true, true)).toBe(true);
  });

  it("counts every game it missed, not just the last", () => {
    creditFinishedGames("abcd", 0, true, true);
    creditFinishedGames("abcd", 3, true, true);
    expect(gamesFinished()).toBe(3);
  });

  it("moves a watcher's bookmark but credits them nothing", () => {
    // They finished no games, so taking a seat afterwards starts from where
    // they sat down rather than from the whole evening they watched.
    creditFinishedGames("abcd", 0, false, true);
    expect(creditFinishedGames("abcd", 4, false, true)).toBe(false);
    expect(gamesFinished()).toBe(0);
    expect(gamesSeen("abcd")).toBe(4);
  });

  it("keeps a separate bookmark per room", () => {
    creditFinishedGames("abcd", 0, true, true);
    creditFinishedGames("efgh", 0, true, true);
    creditFinishedGames("abcd", 2, true, true);
    expect(gamesSeen("abcd")).toBe(2);
    expect(gamesSeen("efgh")).toBe(0);
    expect(gamesFinished()).toBe(2);
  });

  it("credits the games but stays quiet for somebody without the highlights", () => {
    expect(creditFinishedGames("abcd", 0, true, false)).toBe(false);
    expect(creditFinishedGames("abcd", 1, true, false)).toBe(false);
    expect(gamesFinished()).toBe(1);
  });
});
