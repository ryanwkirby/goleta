import { describe, expect, it } from "vitest";

import type { Card, GameEvent, GameView } from "@goleta/engine";

import { DECK, seatAnchor } from "../src/lib/anchors.ts";
import { PEEL_MS, RESHUFFLE_MS } from "../src/lib/beats.ts";
import { RESHUFFLE_CARDS, planFlights, settlesAt } from "../src/motion/plan.ts";
import { DECK as DECK_KEY, PILE } from "../src/lib/anchors.ts";

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

/** A judged call, with the evidence the peel is drawn from. */
const called = (overrides: Partial<Extract<GameEvent, { type: "sunnyCalled" }>> = {}) =>
  ({
    type: "sunnyCalled",
    callerId: "me",
    targetId: "them",
    card: card("t1"),
    correct: true,
    returned: [],
    evidence: { inPlay: card("top"), activeSuit: "H", since: [] },
    ...overrides,
  }) satisfies GameEvent;

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
  it("says it is a deal, so a prompt that has to wait for one can (#75)", () => {
    expect(plan([{ type: "gameStarted", seatsShuffled: false, upcard: card("up") }]).deals).toBe(true);
  });

  it("is the only batch that says so", () => {
    expect(plan([{ type: "played", playerId: "me", card: card("m2") }]).deals).toBe(false);
    expect(plan([{ type: "drew", playerId: "them", card: card("t4") }]).deals).toBe(false);
    expect(plan([called()]).deals).toBe(false);
    expect(plan([]).deals).toBe(false);
  });

  it("fans every dealt card out of the deck, then the upcard", () => {
    const { flights, emptiesPile } = plan([{ type: "gameStarted", seatsShuffled: false, upcard: card("up") }]);

    expect(emptiesPile).toBe(true);
    // Three cards each, plus the upcard.
    expect(flights).toHaveLength(7);
    expect(flights.every((flight) => flight.from[0] === "deck")).toBe(true);

    const last = flights.at(-1);
    expect(last?.card?.id).toBe("up");
    expect(last?.to).toEqual(["pile"]);
  });

  it("deals round-robin, and face down even to you", () => {
    const { flights } = plan([{ type: "gameStarted", seatsShuffled: false, upcard: card("up") }]);
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
    const { flights } = plan([{ type: "gameStarted", seatsShuffled: false, upcard: card("up") }], view({ players }));

    expect(flights).toHaveLength(31);
    expect(settlesAt(flights)).toBeLessThan(1200);
  });
});

describe("a batch", () => {
  it("plays a resolved Sunny call in the order it happened", () => {
    const { flights } = plan([
      called(),
      { type: "surrendered", playerId: "them", card: card("t1"), reason: "sunnyPunishment" },
      { type: "turnedUp", cards: [card("u1"), card("u2")], reason: "sunnyTouched" },
      { type: "turnChanged", playerId: "me" },
    ]);

    expect(flights.map((flight) => flight.card?.id)).toEqual(["t1", "u1", "u2"]);
    const delays = flights.map((flight) => flight.delay);
    expect(delays).toEqual(delays.toSorted((a, b) => a - b));
    expect(new Set(delays).size).toBe(3);
  });

  it("flies what a landed call rewinds back onto the deck, before anything else", () => {
    const { flights } = plan([
      called({ returned: [card("r1")] }),
      { type: "played", playerId: "them", card: card("t1") },
    ]);

    const rewind = flights[0];
    expect(rewind?.card?.id).toBe("r1");
    expect(rewind?.to).toEqual([DECK]);
    expect(rewind?.toPile).toBe(false);
    // The hand as a whole is the fallback origin: by now the card has already
    // left it, so its own anchor is gone.
    expect(rewind?.from).toContain(seatAnchor("them"));
    // And the forced play that follows waits for it.
    expect(flights[1]?.card?.id).toBe("t1");
    expect(flights[1]?.delay).toBeGreaterThan(rewind?.delay ?? 0);
  });

  it("waits for the peel before rewinding anything", () => {
    // The pile is peeled back over the evidence while this is held, and the
    // rewind is the consequence — it may not start underneath the thing it is
    // supposed to follow. (#63)
    const { flights } = plan([called({ returned: [card("r1")] })]);

    expect(flights[0]?.delay).toBeGreaterThanOrEqual(PEEL_MS);
  });

  it("holds the peel open even when a burst has to be squeezed", () => {
    // The cap is on how long the burst takes, not on how long the table waits
    // before it starts. Compressing the hold would drag the rewind back under
    // the evidence.
    const returned = Array.from({ length: 20 }, (_, index) => card(`r${index}`));
    const { flights } = plan([called({ returned })]);

    expect(flights).toHaveLength(20);
    expect(flights[0]?.delay).toBeGreaterThanOrEqual(PEEL_MS);
    expect(settlesAt(flights) - PEEL_MS).toBeLessThan(1400);
  });

  it("moves nothing at all when the call missed", () => {
    // Nothing is rewound, and since #50 nothing is forfeited either — a miss
    // costs the caller a lockout, which is not a thing that flies anywhere.
    const { flights } = plan([called({ correct: false })]);

    expect(flights).toEqual([]);
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

/**
 * The deck running out, which used to pass in under half a second and now gets
 * five (#209). The events always arrive together: the draw that emptied the
 * deck, the recycle, and the card turned up off the fresh deck.
 */
const recycle = (): GameEvent => ({ type: "reshuffled", drawPileSize: 31 });
const upcard = (): GameEvent => ({ type: "turnedUp", cards: [card("u1")], reason: "recycle" });

describe("a reshuffle", () => {

  it("sends a stack of cards back into the deck, not three", () => {
    const { flights } = plan([recycle()]);

    expect(flights).toHaveLength(RESHUFFLE_CARDS);
    for (const flight of flights) {
      expect(flight.from).toEqual([PILE]);
      expect(flight.to).toEqual([DECK_KEY]);
    }
  });

  it("keeps every one of them face down", () => {
    // The recycled pile is shuffled and its order *is* deck order, which
    // `redact.ts` guards. The only face this moment shows is the card turned up
    // at the end of it.
    const { flights } = plan([recycle(), upcard()]);
    const recycled = flights.slice(0, RESHUFFLE_CARDS);

    expect(recycled.every((flight) => flight.card === null)).toBe(true);
    expect(flights.at(-1)?.card?.id).toBe("u1");
  });

  it("is visible for most of the beat rather than busy for all of it", () => {
    const { flights } = plan([recycle()]);
    const last = settlesAt(flights);

    expect(last).toBeGreaterThan(RESHUFFLE_MS * 0.6);
    expect(last).toBeLessThan(RESHUFFLE_MS);
  });

  it("holds everything else in the batch until it is over", () => {
    // What made it unreadable: the card turned up off the fresh deck arrived in
    // the same breath and chased the last card back into it.
    const { flights } = plan([recycle(), upcard()]);

    expect(flights.at(-1)?.delay).toBeGreaterThanOrEqual(RESHUFFLE_MS);
  });

  it("is not squeezed by the burst cap, wherever it sits in the batch", () => {
    // The cap is about a queue nobody is watching any more; a hold is the
    // opposite. It used to be measured from the earliest flight in the batch,
    // which worked only because the one hold there was — the peel — opens its
    // batch. A recycle sits in the middle of one.
    const drew: GameEvent = { type: "drew", playerId: "them", card: card("d1") };
    const { flights } = plan([drew, recycle(), upcard()]);

    expect(settlesAt(flights)).toBeGreaterThan(RESHUFFLE_MS);
    expect(flights.at(-1)?.delay).toBeGreaterThanOrEqual(RESHUFFLE_MS);
  });

  it("queues behind a judged call rather than racing one", () => {
    // A recycle can land in the same breath as a call, and a landed call
    // rewinds the recycle. The peel goes first, always.
    const { flights } = plan([called({ returned: [card("r1")] }), recycle(), upcard()]);
    const recycled = flights.filter((flight) => flight.to[0] === DECK_KEY && flight.card === null);

    expect(recycled).toHaveLength(RESHUFFLE_CARDS);
    for (const flight of recycled) expect(flight.delay).toBeGreaterThanOrEqual(PEEL_MS);
    expect(flights.at(-1)?.delay).toBeGreaterThanOrEqual(PEEL_MS + RESHUFFLE_MS);
  });
});
