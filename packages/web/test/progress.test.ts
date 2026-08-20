import { describe, expect, it } from "vitest";

import { gamesToCredit } from "../src/net/identity.ts";

/**
 * Whether the training wheels come off comes down to one number, and until #184
 * that number only moved if a screen happened to be mounted as a `gameOver`
 * arrived — so a reload or a dropped socket left it at zero and a player was
 * still being shown her playable cards in her second game.
 *
 * It is counted off `room.gamesPlayed` now. What is left to get right is the
 * bookkeeping either side of it, and the two ways of getting it wrong are
 * opposites.
 */
describe("crediting a browser for the games it has finished", () => {
  it("counts a game that finished while this browser was away", () => {
    // The reported bug: seated when the room was at 0, looked again at 1.
    expect(gamesToCredit(0, 1)).toBe(1);
  });

  it("does not count the same game twice on the way back to a finished room", () => {
    // The half that must not regress: coming back to a room whose game has already
    // finished counts nothing new.
    expect(gamesToCredit(1, 1)).toBe(0);
    expect(gamesToCredit(4, 4)).toBe(0);
  });

  it("credits nothing for games played before this browser turned up", () => {
    // Joining part-way through a third game, and the watcher who has been sitting
    // there all evening: no bookmark means a starting line, not a score.
    expect(gamesToCredit(null, 0)).toBe(0);
    expect(gamesToCredit(null, 3)).toBe(0);
  });

  it("counts every game it missed, not just the last one", () => {
    // A phone away for two whole hands has a seat that sat through both.
    expect(gamesToCredit(1, 3)).toBe(2);
  });

  it("never counts backwards", () => {
    // Nothing should move `gamesPlayed` down, and if it ever does it is not a reason
    // to owe anybody a game.
    expect(gamesToCredit(3, 1)).toBe(0);
  });
});
