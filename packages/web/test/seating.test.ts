import { describe, expect, it } from "vitest";

import type { GameView, PlayerView, RoomView } from "@goleta/engine";

import { inTurnOrder, nextStillIn, isHost } from "../src/lib/seating.ts";

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

/** The same table with those seats eliminated. */
const out = (game: GameView, ...ids: string[]): GameView => ({
  ...game,
  players: game.players.map((player) =>
    ids.includes(player.id) ? seat(player.id, true) : player,
  ),
});

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

  // The reversal in #192. It used to rotate strictly by seat, so an eliminated
  // player straight after you sat at the left edge holding a full-width seat
  // for the rest of the game — the honest picture, paid for in the only
  // currency this strip has. They stay on screen and stay named; they stop
  // spending a hand's width on a hand they do not have.
  it("moves an eliminated player to the end rather than leaving them at the edge", () => {
    expect(strip(out(table(SEATS, "a"), "b"))).toEqual(["c", "d", "b"]);
  });

  it("keeps turn order among the ones still in, and seat order among the ones out", () => {
    // From seat `a` the strip is b, c, d; knock out b and c and the two of them
    // stay in that relative order behind d.
    expect(strip(out(table(SEATS, "a"), "b", "c"))).toEqual(["d", "b", "c"]);
    // And from seat `c`, where the rotation starts at d.
    expect(strip(out(table(SEATS, "c"), "d", "a"))).toEqual(["b", "d", "a"]);
  });

  it("does the same for a spectator, who sees this same strip on a shared screen", () => {
    expect(strip(out(table(SEATS, null), "a", "c"))).toEqual(["b", "d", "a", "c"]);
  });

  it("reorders once per elimination and not otherwise", () => {
    // The cost of the reversal, stated: the strip moves when somebody goes out,
    // at a moment the whole table is already watching. It does not move again.
    const one = strip(out(table(SEATS, "a"), "b"));
    expect(strip(out(table(SEATS, "a"), "b"))).toEqual(one);
  });

  it("leaves a table with nobody out exactly as it was", () => {
    for (const you of SEATS) expect(strip(table(SEATS, you))).toEqual(strip(table(SEATS, you)));
    expect(strip(table(SEATS, "a"))).toEqual(["b", "c", "d"]);
  });
});

const id = (player: PlayerView | null) => player?.id ?? null;

describe("who the strip anchors on during your own turn", () => {
  it("is the player who plays after you, when they are still in", () => {
    expect(id(nextStillIn([seat("b"), seat("c"), seat("d")]))).toBe("b");
  });

  it("skips past the ones who are out, however many there are", () => {
    expect(id(nextStillIn([seat("b", true), seat("c"), seat("d")]))).toBe("c");
    expect(id(nextStillIn([seat("b", true), seat("c", true), seat("d")]))).toBe("d");
  });

  it("passes over an out seat without reordering the strip around it", () => {
    const order = [seat("b", true), seat("c"), seat("d")];
    nextStillIn(order);
    expect(order.map((player) => player.id)).toEqual(["b", "c", "d"]);
  });

  it("is nobody once everyone else is out", () => {
    expect(nextStillIn([seat("b", true), seat("c", true)])).toBeNull();
    expect(nextStillIn([])).toBeNull();
  });
});

/** Only the field this predicate reads; a whole `RoomView` fixture would hide
 * which one matters. */
const roomHeldBy = (hostId: string | null) => ({ hostId }) as RoomView;

describe("who the host is", () => {
  it("is the seat whose id matches", () => {
    expect(isHost(roomHeldBy("p1"), "p1")).toBe(true);
    expect(isHost(roomHeldBy("p1"), "p2")).toBe(false);
  });

  it("is nobody in a room nobody owns", () => {
    // The case this exists for (#326). A room opened from the shared table
    // screen has no host until somebody joins and a watcher has no `playerId`,
    // so the obvious `room.hostId === playerId` is `null === null` and tells
    // every spectator of an ownerless room that they are the host — offering
    // them controls the server refuses.
    expect(isHost(roomHeldBy(null), null)).toBe(false);
    expect(isHost(roomHeldBy(null), "p1")).toBe(false);
  });

  it("is never a browser holding no seat", () => {
    expect(isHost(roomHeldBy("p1"), null)).toBe(false);
  });
});
