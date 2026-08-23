import { describe, expect, it } from "vitest";

import type { Card, GameView } from "@goleta/engine";

import { pileSuit } from "../src/lib/pile.ts";

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
  sunnyLockedReaches: 0,
  legalCardIds: [],
  youMustPlay: false,
  canEndTurn: false,
  status: "playing",
  winnerId: null,
  turnNumber: 7,
  ...overrides,
});

describe("what the pile says about the suit", () => {
  it("says nothing when the card in play is the suit in play", () => {
    const top = card("top", "7", "H");
    expect(pileSuit(view({ topCard: top, activeSuit: "H" }), top)).toBeNull();
  });

  it("names the suit once somebody has named it", () => {
    const eight = card("e", "8", "S");
    expect(pileSuit(view({ topCard: eight, activeSuit: "C", namedSuit: "C" }), eight)).toEqual({
      kind: "named",
      suit: "C",
    });
  });

  it("names it when the namer picked the 8's own suit", () => {
    // The play this used to hide (#114). Naming the suit already on the card is
    // how you leave the next seat something to follow, and the comparison this
    // replaced could not tell it apart from nobody having named anything.
    const eight = card("e", "8", "S");
    expect(pileSuit(view({ topCard: eight, activeSuit: "S", namedSuit: "S" }), eight)).toEqual({
      kind: "named",
      suit: "S",
    });
  });

  it("says nothing for an 8 that was turned up rather than played", () => {
    // A natural 8 — seeded, recycled, or flipped by a Sunny call. Its own suit
    // is in play because it is printed on it, and nobody chose anything.
    const eight = card("e", "8", "D");
    expect(pileSuit(view({ topCard: eight, activeSuit: "D" }), eight)).toBeNull();
  });

  it("says a suit is owed while nobody has answered", () => {
    // The 8 has landed and `activeSuit` still holds the suit that was live
    // before it — the last true answer, and not a call anybody made (#76). What
    // it is *not* is a settled board, and saying nothing at all here made it
    // look like one to a player deciding whether to draw (#150).
    const eight = card("e", "8", "S");
    const game = view({
      topCard: eight,
      activeSuit: "C",
      phase: { kind: "suit", playerId: "me" },
    });
    expect(pileSuit(game, eight)).toEqual({ kind: "owed" });
  });

  it("says it for a bot's beat too, and never names the stale suit", () => {
    // Same window, somebody else's call. It is the whole table's business, not
    // only the player being asked — and the one thing it must never do is offer
    // `activeSuit`, which is the board about to be replaced.
    const eight = card("e", "8", "D");
    const game = view({
      topCard: eight,
      activeSuit: "C",
      waitingOn: "bot",
      phase: { kind: "suit", playerId: "bot" },
    });
    expect(pileSuit(game, eight)).toEqual({ kind: "owed" });
  });

  it("says nothing while the pile is still showing the card being landed on", () => {
    // A recycle is the clearest case: `turnUp` moves the suit to the freshly
    // turned card while the pile still shows the old one, and a badge against a
    // card it does not describe is the flash this rules out.
    const turned = card("new", "K", "S");
    const stillShowing = card("old", "3", "H");
    expect(pileSuit(view({ topCard: turned, activeSuit: "S" }), stillShowing)).toBeNull();
  });

  it("says nothing about a card that has been played over", () => {
    // The named suit belongs to the card it was named on. Once something else
    // is up, a badge still holding the old answer would describe a board that
    // has moved on.
    const named = card("e", "8", "S");
    const nowUp = card("k", "K", "C");
    const game = view({ topCard: nowUp, activeSuit: "C", namedSuit: "H" });
    expect(pileSuit(game, named)).toBeNull();
  });

  it("says nothing when there is no card up at all", () => {
    expect(pileSuit(view(), null)).toBeNull();
  });

  it("says nothing about a suit owed for a card still in the air", () => {
    // Dealer's Choice opens in `phase: "suit"` with the upcard still being
    // dealt (#75). A suit cannot be owed for a card nobody can see, and the
    // picker is held back for the same beat.
    const eight = card("e", "8", "C");
    const game = view({ topCard: eight, phase: { kind: "suit", playerId: "me" } });
    expect(pileSuit(game, null)).toBeNull();
    expect(pileSuit(game, eight)).toEqual({ kind: "owed" });
  });

  it("names it again the moment the flight lands", () => {
    const eight = card("e", "8", "S");
    const game = view({ topCard: eight, activeSuit: "D", namedSuit: "D" });
    expect(pileSuit(game, null)).toBeNull();
    expect(pileSuit(game, eight)).toEqual({ kind: "named", suit: "D" });
  });
});
