import { describe, expect, it } from "vitest";

import type { Card, GameEvent } from "@goleta/engine";

import { describeEvent, spellSuits } from "../src/lib/format.ts";

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
  { type: "gameStarted", upcard: card("7S") },
  { type: "played", playerId: "p1", card: card("JH") },
  { type: "drew", playerId: "p2", card: card("10D") },
  { type: "turnedUp", cards: [card("3C"), card("QH")], reason: "recycle" },
  { type: "surrendered", playerId: "p1", card: card("AS"), reason: "sunnyPunishment" },
];

describe("naming a card in the log", () => {
  it("uses the pip, not the letter", () => {
    expect(say({ type: "played", playerId: "p1", card: card("7S") })).toBe("Ana played 7♠.");
    expect(say({ type: "drew", playerId: "p2", card: card("JH") })).toBe("Bo drew J♥.");
    expect(say({ type: "gameStarted", upcard: card("10D") })).toBe("New game. 10♦ turned up.");
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
