import { describe, expect, it } from "vitest";

import type { Card, GameEvent, GameView } from "@goleta/engine";

import { planFlights, settlesAt } from "../src/motion/plan.ts";

const card = (id: string, rank: Card["rank"] = "7", suit: Card["suit"] = "H"): Card => ({
  id,
  rank,
  suit,
});

/** A table where you are `me`, facing one other player. */
const view = (overrides: Partial<GameView> = {}): GameView => ({
  you: "me",
  players: [
    { id: "me", cardCount: 3, eliminated: false, hand: [card("m1"), card("m2"), card("m3")] },
    { id: "them", cardCount: 3, eliminated: false, hand: [card("t1"), card("t2"), card("t3")] },
  ],
  turnPlayerId: "me",
  waitingOn: "me",
  phase: { kind: "action" },
  topCard: card("top"),
  activeSuit: "H",
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

const ids = () => {
  let next = 0;
  return () => `f${(next += 1)}`;
};

const plan = (events: GameEvent[], game: GameView = view()) => planFlights(events, game, ids());

describe("what moves", () => {
  it("flies your play from the card itself, falling back to the hand", () => {
    const { flights } = plan([{ type: "played", playerId: "me", card: card("m2") }]);

    expect(flights).toHaveLength(1);
    expect(flights[0]?.from).toEqual(["card:m2", "hand"]);
    expect(flights[0]?.to).toEqual(["pile"]);
    expect(flights[0]?.toPile).toBe(true);
    expect(flights[0]?.card?.id).toBe("m2");
  });

  it("flies someone else's play out of their seat", () => {
    const { flights } = plan([{ type: "played", playerId: "them", card: card("t1") }]);

    expect(flights[0]?.from).toEqual(["card:t1", "seat:them"]);
    expect(flights[0]?.fromSize).toBe("sm");
    expect(flights[0]?.size).toBe("lg");
  });

  it("lands a punishment card face up on the pile", () => {
    // The only way a card leaves a hand without being played. A wrong call
    // costs no card at all now, so nothing is ever buried under the pile.
    const { flights } = plan([
      { type: "surrendered", playerId: "me", card: card("m1"), reason: "sunnyPunishment" },
    ]);

    expect(flights[0]?.toPile).toBe(true);
    expect(flights[0]?.to).toEqual(["pile"]);
  });

  it("says nothing at all about a suit being called", () => {
    const { flights } = plan([{ type: "suitChosen", playerId: "me", suit: "S" }]);
    expect(flights).toEqual([]);
  });
});

describe("a draw", () => {
  it("shows your own, and holds it back until it lands", () => {
    const { flights } = plan([{ type: "drew", playerId: "me", card: card("m4") }]);

    expect(flights[0]?.card?.id).toBe("m4");
    expect(flights[0]?.to).toEqual(["card:m4", "hand"]);
    expect(flights[0]?.hides).toBe("m4");
  });

  it("shows someone else's the same way, flying it to their seat", () => {
    const { flights } = plan([{ type: "drew", playerId: "them", card: card("t4") }]);

    expect(flights[0]?.card?.id).toBe("t4");
    expect(flights[0]?.from).toEqual(["deck"]);
    expect(flights[0]?.to).toEqual(["card:t4", "seat:them"]);
    expect(flights[0]?.hides).toBe("t4");
  });
});

describe("a deal", () => {
  it("fans every dealt card out of the deck, then the upcard", () => {
    const { flights, emptiesPile } = plan([{ type: "gameStarted", upcard: card("up") }]);

    expect(emptiesPile).toBe(true);
    // Three cards each, plus the upcard.
    expect(flights).toHaveLength(7);
    expect(flights.every((flight) => flight.from[0] === "deck")).toBe(true);

    const last = flights.at(-1);
    expect(last?.card?.id).toBe("up");
    expect(last?.to).toEqual(["pile"]);
  });

  it("deals round-robin, and face down even to you", () => {
    const { flights } = plan([{ type: "gameStarted", upcard: card("up") }]);
    const dealt = flights.slice(0, -1);

    expect(dealt.map((flight) => flight.to[0])).toEqual([
      "card:m1",
      "card:t1",
      "card:m2",
      "card:t2",
      "card:m3",
      "card:t3",
    ]);
    // Every card arrives face down and turns over as it lands.
    expect(dealt.every((flight) => flight.card === null)).toBe(true);
    expect(dealt.filter((flight) => flight.hides !== null)).toHaveLength(6);
  });

  it("keeps a full table's deal inside a second", () => {
    const players = Array.from({ length: 6 }, (_, index) => ({
      id: `p${index}`,
      cardCount: 5,
      eliminated: false,
      hand: [0, 1, 2, 3, 4].map((n) => card(`p${index}c${n}`)),
    }));
    const { flights } = plan([{ type: "gameStarted", upcard: card("up") }], view({ players }));

    expect(flights).toHaveLength(31);
    expect(settlesAt(flights)).toBeLessThan(1200);
  });
});

describe("a batch", () => {
  it("plays a resolved Sunny call in the order it happened", () => {
    const { flights } = plan([
      { type: "sunnyCalled", callerId: "me", targetId: "them", card: card("t1"), correct: true },
      { type: "surrendered", playerId: "them", card: card("t1"), reason: "sunnyPunishment" },
      { type: "turnedUp", cards: [card("u1"), card("u2")], reason: "sunnyTouched" },
      { type: "turnChanged", playerId: "me" },
    ]);

    expect(flights.map((flight) => flight.card?.id)).toEqual(["t1", "u1", "u2"]);
    const delays = flights.map((flight) => flight.delay);
    expect(delays).toEqual(delays.toSorted((a, b) => a - b));
    expect(new Set(delays).size).toBe(3);
  });

  it("compresses a burst rather than falling behind the table", () => {
    const events: GameEvent[] = Array.from({ length: 20 }, (_, index) => ({
      type: "played",
      playerId: "them",
      card: card(`t${index}`),
    }));
    const { flights } = plan(events);

    expect(flights).toHaveLength(20);
    expect(settlesAt(flights)).toBeLessThanOrEqual(1200);
  });
});
