import { describe, expect, it } from "vitest";

import type { Card, GameEvent, GameView } from "@goleta/engine";

import { describeEvent, spellSuits, turnPrompt } from "../src/lib/format.ts";

/** `card("10D")` — the same shorthand the engine tests use. */
const card = (spec: string): Card => ({
  id: `${spec}#1`,
  rank: spec.slice(0, -1) as Card["rank"],
  suit: spec.slice(-1) as Card["suit"],
});

const nameOf = (playerId: string): string => (playerId === "p1" ? "Ana" : "Bo");
const say = (event: GameEvent): string => describeEvent(event, nameOf);

/** Every event that names a card at all. */
const namingCards: GameEvent[] = [
  { type: "gameStarted", upcard: card("7S"), seatsShuffled: false },
  { type: "played", playerId: "p1", card: card("JH") },
  { type: "drew", playerId: "p2", card: card("10D") },
  { type: "turnedUp", cards: [card("3C"), card("QH")], reason: "recycle" },
  { type: "surrendered", playerId: "p1", card: card("AS"), reason: "sunnyPunishment" },
  // The one that was missing, and the one still doing it (#286).
  {
    type: "sunnyCalled",
    callerId: "p1",
    targetId: "p2",
    card: card("7C"),
    correct: true,
    returned: [],
    evidence: { inPlay: card("5S"), activeSuit: "S", since: [] },
  },
];

describe("naming a card in the log", () => {
  it("uses the pip, not the letter", () => {
    expect(say({ type: "played", playerId: "p1", card: card("7S") })).toBe("Ana played 7♠.");
    expect(say({ type: "drew", playerId: "p2", card: card("JH") })).toBe("Bo drew J♥.");
    expect(say({ type: "gameStarted", upcard: card("10D"), seatsShuffled: false })).toBe("New game. 10♦ turned up.");
  });

  it("turns every card up with a pip, however many there are", () => {
    const line = say({ type: "turnedUp", cards: [card("3C"), card("8S")], reason: "sunnyTouched" });
    expect(line).toContain("3♣, 8♠");
  });

  // The bug this replaces: `${card.rank}${card.suit}` reading out as "7S".
  it("leaves no bare suit letter anywhere", () => {
    for (const event of namingCards) {
      expect(say(event)).not.toMatch(/\d[CDHS]\b|[JQKA][CDHS]\b/);
    }
  });

  it("still spells out a *named* suit, which is a suit and not a card", () => {
    expect(say({ type: "suitChosen", playerId: "p1", suit: "H" })).toBe("Ana called hearts.");
  });
});

describe("saying the same line out loud", () => {
  it("spells the pips, because a screen reader may drop them", () => {
    expect(spellSuits("Ana played 7♠.")).toBe("Ana played 7 of spades.");
    expect(spellSuits("3♣, 8♠ turned up.")).toBe("3 of clubs, 8 of spades turned up.");
  });

  it("leaves a line with no cards in it alone", () => {
    const line = say({ type: "gameOver", winnerId: "p1", reason: "lastStanding" });
    expect(spellSuits(line)).toBe(line);
  });
});

/** Only the fields the prompt reads; the rest of the view is irrelevant. */
const table = (overrides: Partial<GameView> = {}): GameView =>
  ({
    you: "p1",
    waitingOn: "p1",
    turnPlayerId: "p1",
    phase: { kind: "action" },
    youMustPlay: false,
    canEndTurn: false,
    status: "playing",
    winnerId: null,
    ...overrides,
  }) as GameView;

const asks = (game: GameView, dealing?: boolean): string =>
  turnPrompt(game, nameOf, false, dealing);

describe("what the table is waiting for", () => {
  it("asks the namer for a suit, and tells everyone else who is naming it", () => {
    const suit = { kind: "suit", playerId: "p1" } as const;
    expect(asks(table({ phase: suit }))).toBe("Choose a suit.");
    expect(asks(table({ phase: suit, you: "p2" }))).toBe("Ana is naming a suit.");
  });

  // Under Dealer's Choice the game opens in `phase: "suit"`, so the ask can
  // arrive while the cards are still going out. The picker is held back with it
  // — the two have to appear together, or the line asks for something there is
  // nothing on screen to answer with (#75).
  it("says the table is dealing rather than asking for a suit mid-deal", () => {
    const suit = { kind: "suit", playerId: "p1" } as const;
    expect(asks(table({ phase: suit }), true)).toBe("Dealing…");
    expect(asks(table({ phase: suit, you: "p2" }), true)).toBe("Dealing…");
  });

  it("holds nothing else back for the deal — every other prompt can be acted on", () => {
    expect(asks(table(), true)).toBe("Your turn.");
    expect(asks(table({ you: "p2" }), true)).toBe("Ana's turn.");
    expect(asks(table({ phase: { kind: "sunnyPlay" } }), true)).toContain("Step 1 of 3");
  });

  // The shared table screen reads this same line, as a viewer holding no cards
  // (#185). It used to say only whose turn it was, in a sentence of its own —
  // so a landed call's punishment, the one moment the table most needs telling
  // what is going on, was the thing it could not say.
  it("answers for a screen with nobody behind it, at every phase", () => {
    const watching = (overrides: Partial<GameView> = {}): string =>
      asks(table({ you: null, waitingOn: "p2", turnPlayerId: "p2", ...overrides }));

    expect(watching()).toBe("Bo's turn.");
    expect(watching({ phase: { kind: "suit", playerId: "p2" } })).toBe("Bo is naming a suit.");
    // The two the band was silent on, and the reason this matters: a call lands
    // and the table is walked through a numbered punishment.
    expect(watching({ phase: { kind: "sunnyPlay" } })).toBe(
      "Bo has to make the play they skipped — step 1 of 3.",
    );
    expect(watching({ phase: { kind: "surrender", playerId: "p2", reason: "sunnyPunishment" } })).toBe(
      "Bo owes a punishment card — step 2 of 3.",
    );
    expect(
      watching({ phase: { kind: "over" }, status: "over", winnerId: "p2", waitingOn: null }),
    ).toBe("Bo wins, still holding cards.");
  });

  // The line that told you to draw after your third draw, an inch above the only
  // control left to press (#333). The two halves of `canEndTurn` read the same,
  // and so does a hand holding a play — the prompt must not separate an honest
  // end from a dishonest one (#260).
  it("stops telling you to draw once the turn has nowhere left to go", () => {
    const helped = (overrides: Partial<GameView> = {}): string =>
      turnPrompt(table({ canEndTurn: true, ...overrides }), nameOf, true);

    expect(helped()).toBe("Your turn — no draws left.");
    expect(helped({ youMustPlay: true })).toBe("Your turn — no draws left.");
  });

  it("says nothing of the sort with hints off, or with draws still to take", () => {
    expect(turnPrompt(table({ canEndTurn: true }), nameOf, false)).toBe("Your turn.");
    expect(turnPrompt(table({ canEndTurn: false }), nameOf, true)).toBe("Nothing matches. Draw a card.");
    expect(turnPrompt(table({ canEndTurn: false, youMustPlay: true }), nameOf, true)).toBe(
      "Your turn — you have a card that matches, so you have to play it.",
    );
  });

  // Reduced motion plans no flights at all, so nothing is ever mid-deal there —
  // and the default is what every caller outside the motion layer gets.
  it("asks for the suit straight away when nothing is in the air", () => {
    expect(asks(table({ phase: { kind: "suit", playerId: "p1" } }))).toBe("Choose a suit.");
    expect(asks(table({ phase: { kind: "suit", playerId: "p1" } }), false)).toBe("Choose a suit.");
  });
});

describe("what the table is told when the deck runs out", () => {
  it("says it in words, with the count that came on the wire", () => {
    const line = turnPrompt(table(), nameOf, false, false, 31);

    expect(line).toContain("Deck ran out");
    expect(line).toContain("31");
  });

  it("outranks whose turn it is, because for five seconds it is the answer", () => {
    // Every screen has this one line and only one of them has a log, so the
    // reshuffle takes it while it lasts (#209).
    const waiting = table({ waitingOn: "p1", you: "p1" });

    expect(turnPrompt(waiting, nameOf, false)).toBe("Your turn.");
    expect(turnPrompt(waiting, nameOf, false, false, 31)).toContain("Deck ran out");
  });

  it("does not outrank the game being over", () => {
    const over = table({
      status: "over",
      winnerId: "p1",
      phase: { kind: "over" },
    });

    expect(turnPrompt(over, nameOf, false, false, 31)).toContain("wins");
  });

  it("says nothing at all the rest of the time", () => {
    expect(turnPrompt(table(), nameOf, false)).not.toContain("Deck ran out");
    expect(turnPrompt(table(), nameOf, false, false, null)).not.toContain("Deck ran out");
  });
});
