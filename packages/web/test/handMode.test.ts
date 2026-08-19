import { describe, expect, it } from "vitest";

import type { GameView } from "@goleta/engine";

import { assisting, handMode } from "../src/lib/handMode.ts";

/**
 * The two questions your own cards answer, and the one assertion that matters
 * most in this file: `assisting` is **false** the rest of the time.
 *
 * The app does not tell you which of your cards are playable. Being caught out
 * having a play you did not make is the whole subject of the Sunny Rule, and an
 * app that points at the answer never lets anybody be caught. There are exactly
 * three ways the marks come on and all three are visible to the table.
 */

const view = (over: Partial<GameView> = {}): GameView =>
  ({
    you: "me",
    phase: { kind: "action" },
    turnNumber: 5,
    ...over,
  }) as unknown as GameView;

describe("whether the app is pointing at the answer", () => {
  it("is off by default, which is the whole of the Sunny Rule", () => {
    expect(assisting(view(), false, null)).toBe(false);
  });

  it("is on for your own standing preference, read live", () => {
    expect(assisting(view(), true, null)).toBe(true);
  });

  it("is on for the play you owe after a call has landed on you", () => {
    // Already caught, the move is forced, nothing left to fumble.
    expect(assisting(view({ phase: { kind: "sunnyPlay" } as GameView["phase"] }), false, null))
      .toBe(true);
  });

  it("is on for the single turn bought with `want help?`", () => {
    expect(assisting(view({ turnNumber: 5 }), false, 5)).toBe(true);
  });

  it("goes off again on the next turn after help was asked for", () => {
    // One turn, out loud, in front of everybody — not a mode you stay in.
    expect(assisting(view({ turnNumber: 6 }), false, 5)).toBe(false);
  });

  it("is not turned on by it merely being your turn", () => {
    expect(assisting(view({ phase: { kind: "action" } as GameView["phase"] }), false, null))
      .toBe(false);
  });

  it("is not turned on by naming a suit", () => {
    expect(assisting(view({ phase: { kind: "suit" } as GameView["phase"] }), false, null))
      .toBe(false);
  });
});

describe("what tapping one of your cards does", () => {
  it("plays it when the table is waiting on you", () => {
    expect(handMode(view(), true, false)).toBe("play");
  });

  it("does nothing when the table is waiting on somebody else", () => {
    expect(handMode(view(), false, false)).toBe("idle");
  });

  it("is forced for the card owed after a landed call", () => {
    expect(handMode(view({ phase: { kind: "sunnyPlay" } as GameView["phase"] }), true, false))
      .toBe("forced");
  });

  it("surrenders when the surrender is yours", () => {
    const phase = { kind: "surrender", playerId: "me" } as unknown as GameView["phase"];
    expect(handMode(view({ phase }), false, false)).toBe("surrender");
  });

  it("does not surrender on somebody else's surrender", () => {
    const phase = { kind: "surrender", playerId: "them" } as unknown as GameView["phase"];
    expect(handMode(view({ phase }), false, false)).toBe("idle");
  });

  it("goes dead the moment a call lands on you, ahead of everything else", () => {
    // The tap that would fire the forced play is very often the tail of the one
    // that drew the card you were caught for. A punishment served before you
    // have watched the evidence and read the sentence isn't one.
    const phase = { kind: "sunnyPlay" } as GameView["phase"];
    expect(handMode(view({ phase }), true, true)).toBe("idle");
  });

  it("stays dead even for a surrender that is yours", () => {
    const phase = { kind: "surrender", playerId: "me" } as unknown as GameView["phase"];
    expect(handMode(view({ phase }), true, true)).toBe("idle");
  });
});
