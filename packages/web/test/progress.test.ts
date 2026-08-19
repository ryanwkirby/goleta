import { describe, expect, it } from "vitest";

import { gamesToCredit } from "../src/net/identity.ts";

/**
 * Whether the training wheels come off comes down to one number, and until
 * #184 that number only moved if a screen happened to be mounted at the instant
 * a `gameOver` event arrived. The event log starts empty on every page load, so
 * a reload, a force-quit, a socket that dropped and came back after the hand, or
 * a rejoin from a new tab all left it at zero — and a player was still being
 * shown her playable cards in her second game.
 *
 * It is counted off `room.gamesPlayed` now, which the server owns and which
 * survives all four. What is left to get right is the bookkeeping either side
 * of it, and the two ways of getting it wrong are opposites.
 */
describe("crediting a browser for the games it has finished", () => {
  it("counts a game that finished while this browser was away", () => {
    // The reported bug. The phone was seated when the room was at 0 and looked
    // again when it was at 1; what it was doing in between is not the point.
    expect(gamesToCredit(0, 1)).toBe(1);
  });

  it("does not count the same game twice on the way back to a finished room", () => {
    // The care the old code took, and the half that must not regress: coming
    // back to a room whose game has already finished counts nothing new.
    expect(gamesToCredit(1, 1)).toBe(0);
    expect(gamesToCredit(4, 4)).toBe(0);
  });

  it("credits nothing for games played before this browser turned up", () => {
    // Joining a table part-way through its third game, and the watcher who has
    // been sitting there all evening: no bookmark means no score, only a
    // starting line. Both have finished exactly none of them.
    expect(gamesToCredit(null, 0)).toBe(0);
    expect(gamesToCredit(null, 3)).toBe(0);
  });

  it("counts every game it missed, not just the last one", () => {
    // A phone away for two whole hands has a seat that sat through both.
    expect(gamesToCredit(1, 3)).toBe(2);
  });

  it("never counts backwards", () => {
    // Nothing should move `gamesPlayed` down — a redeploy restores the
    // snapshot, and a discarded one comes back as a room this browser has
    // never seen. If it ever does, it is not a reason to owe anybody a game.
    expect(gamesToCredit(3, 1)).toBe(0);
  });
});
