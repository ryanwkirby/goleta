import { describe, expect, it } from "vitest";

import type { GameView, PlayerView } from "@goleta/engine";

import { inTurnOrder } from "../src/lib/seating.ts";

const seat = (id: string, eliminated = false): PlayerView => ({
  id,
  cardCount: 3,
  eliminated,
  hand: [],
});

/** Only the two fields the rotation reads; the rest of the view is irrelevant. */
const table = (ids: string[], you: string | null): GameView =>
  ({ players: ids.map((id) => seat(id)), you }) as GameView;

const strip = (game: GameView): string[] => inTurnOrder(game).map((player) => player.id);

const SEATS = ["a", "b", "c", "d"];

describe("the order of the seat strip", () => {
  it("starts with the player who plays after you, from every seat at the table", () => {
    expect(strip(table(SEATS, "a"))).toEqual(["b", "c", "d"]);
    expect(strip(table(SEATS, "b"))).toEqual(["c", "d", "a"]);
    expect(strip(table(SEATS, "c"))).toEqual(["d", "a", "b"]);
    expect(strip(table(SEATS, "d"))).toEqual(["a", "b", "c"]);
  });

  it("ends with the player who plays immediately before you", () => {
    for (const you of SEATS) {
      const order = strip(table(SEATS, you));
      const before = SEATS[(SEATS.indexOf(you) + SEATS.length - 1) % SEATS.length];
      expect(order.at(-1)).toBe(before);
    }
  });

  it("never includes you", () => {
    for (const you of SEATS) expect(strip(table(SEATS, you))).not.toContain(you);
  });

  it("keeps absolute seat order for a spectator, who has no seat to anchor on", () => {
    expect(strip(table(SEATS, null))).toEqual(SEATS);
  });

  // Rotating by seat rather than by who's left means an eliminated player can
  // sit at the left edge. Deliberate: they're still at the table, and the strip
  // never reorders mid-game.
  it("holds its order when the player after you is eliminated", () => {
    const game = table(SEATS, "a");
    const out = { ...game, players: game.players.map((p) => (p.id === "b" ? seat("b", true) : p)) };
    expect(strip(out)).toEqual(["b", "c", "d"]);
  });
});
