import { describe, expect, it } from "vitest";

import type { Card, GameView } from "@goleta/engine";

import { calledSuit } from "../src/lib/pile.ts";

const card = (id: string, rank: Card["rank"] = "7", suit: Card["suit"] = "H"): Card => ({
  id,
  rank,
  suit,
});

const view = (overrides: Partial<GameView> = {}): GameView => ({
  you: "me",
  players: [{ id: "me", cardCount: 3, eliminated: false, hand: [] }],
  turnPlayerId: "me",
  waitingOn: "me",
  phase: { kind: "action" },
  topCard: card("top", "7", "H"),
  activeSuit: "H",
  namedSuit: null,
  drawPileSize: 20,
  discardPileSize: 4,
  drawsThisTurn: 0,
  sunnyCallable: false,
  sunnyTargetId: null,
  sunnyReach: null,
  sunnyLockedDraws: 0,
  legalCardIds: [],
  youMustPlay: false,
  status: "playing",
  winnerId: null,
  turnNumber: 7,
  ...overrides,
});

describe("whether the pile says a suit has been called", () => {
  it("says nothing when the card in play is the suit in play", () => {
    const top = card("top", "7", "H");
    expect(calledSuit(view({ topCard: top, activeSuit: "H" }), top)).toBeNull();
  });

  it("names the suit once somebody has named it", () => {
    const eight = card("e", "8", "S");
    expect(calledSuit(view({ topCard: eight, activeSuit: "C", namedSuit: "C" }), eight)).toBe("C");
  });

  it("names it when the namer picked the 8's own suit", () => {
    // The play this used to hide (#114). Naming the suit already on the card is
    // how you leave the next seat something to follow, and the comparison this
    // replaced could not tell it apart from nobody having named anything.
    const eight = card("e", "8", "S");
    expect(calledSuit(view({ topCard: eight, activeSuit: "S", namedSuit: "S" }), eight)).toBe("S");
  });

  it("says nothing for an 8 that was turned up rather than played", () => {
    // A natural 8 — seeded, recycled, or flipped by a Sunny call. Its own suit
    // is in play because it is printed on it, and nobody chose anything.
    const eight = card("e", "8", "D");
    expect(calledSuit(view({ topCard: eight, activeSuit: "D" }), eight)).toBeNull();
  });

  it("says nothing while a suit is owed and nobody has answered", () => {
    // The 8 has landed and `activeSuit` still holds the suit that was live
    // before it — the last true answer, and not a call anybody made (#76).
    const eight = card("e", "8", "S");
    const game = view({
      topCard: eight,
      activeSuit: "C",
      phase: { kind: "suit", playerId: "me" },
    });
    expect(calledSuit(game, eight)).toBeNull();
  });

  it("says nothing for a bot's beat either", () => {
    // Same window, somebody else's call. It is wrong for the whole table, not
    // only for the player being asked.
    const eight = card("e", "8", "D");
    const game = view({
      topCard: eight,
      activeSuit: "C",
      waitingOn: "bot",
      phase: { kind: "suit", playerId: "bot" },
    });
    expect(calledSuit(game, eight)).toBeNull();
  });

  it("says nothing while the pile is still showing the card being landed on", () => {
    // A recycle is the clearest case: `turnUp` moves the suit to the freshly
    // turned card while the pile still shows the old one, and a badge against a
    // card it does not describe is the flash this rules out.
    const turned = card("new", "K", "S");
    const stillShowing = card("old", "3", "H");
    expect(calledSuit(view({ topCard: turned, activeSuit: "S" }), stillShowing)).toBeNull();
  });

  it("says nothing about a card that has been played over", () => {
    // The named suit belongs to the card it was named on. Once something else
    // is up, a badge still holding the old answer would describe a board that
    // has moved on.
    const named = card("e", "8", "S");
    const nowUp = card("k", "K", "C");
    const game = view({ topCard: nowUp, activeSuit: "C", namedSuit: "H" });
    expect(calledSuit(game, named)).toBeNull();
  });

  it("says nothing when there is no card up at all", () => {
    expect(calledSuit(view(), null)).toBeNull();
  });

  it("names it again the moment the flight lands", () => {
    const eight = card("e", "8", "S");
    const game = view({ topCard: eight, activeSuit: "D", namedSuit: "D" });
    expect(calledSuit(game, null)).toBeNull();
    expect(calledSuit(game, eight)).toBe("D");
  });
});
