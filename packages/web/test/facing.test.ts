import { describe, expect, it } from "vitest";

import type { GameView, RoomView, SeatView } from "@goleta/engine";

import { facingTurn, seatToFace } from "../src/lib/facing.ts";

/**
 * Just enough of a room and a view for the two questions this asks: who is on
 * the clock, which seats are bots, and which are out.
 */
const roomOf = (...seats: [string, boolean][]): RoomView =>
  ({
    seats: seats.map(([name, bot]) => ({ id: name, name, bot, connected: true }) as SeatView),
  }) as RoomView;

const gameOf = (waitingOn: string | null, out: string[] = []): GameView =>
  ({
    waitingOn,
    players: out.map((id) => ({ id, eliminated: true })),
  }) as GameView;

/** Four seats is one per edge, in turn order: top, right, bottom, left. */
const FOUR = roomOf(["Top", false], ["Right", false], ["Bottom", false], ["Left", false]);

describe("which way up the shared table screen says things", () => {
  it("faces the seat on the clock", () => {
    expect(seatToFace(FOUR, gameOf("Top"))).toBe(0);
    expect(seatToFace(FOUR, gameOf("Bottom"))).toBe(2);
  });

  it("turns the board for somebody across the table and leaves it for somebody at this end", () => {
    // The whole of the complaint: a player at the top read their own name the
    // right way up and the sentence about their own turn upside down (#160).
    expect(facingTurn(FOUR, gameOf("Top"))).toBe(180);
    expect(facingTurn(FOUR, gameOf("Bottom"))).toBe(0);
  });

  it("leaves it upright for the seats down the sides", () => {
    // They read at a slant whichever way it is turned, and a slant was never
    // the complaint — so they get what the rest of the table is reading.
    expect(facingTurn(FOUR, gameOf("Right"))).toBe(0);
    expect(facingTurn(FOUR, gameOf("Left"))).toBe(0);
  });

  it("walks past a bot to the next person who is actually up", () => {
    // Nobody needs the board turned towards a robot.
    const room = roomOf(["Top", true], ["Right", true], ["Bottom", false], ["Left", false]);
    expect(seatToFace(room, gameOf("Top"))).toBe(2);
    expect(facingTurn(room, gameOf("Top"))).toBe(0);
  });

  it("wraps round the table rather than stopping at the last seat", () => {
    const room = roomOf(["Top", false], ["Right", true], ["Bottom", true], ["Left", true]);
    expect(seatToFace(room, gameOf("Right"))).toBe(0);
    expect(facingTurn(room, gameOf("Right"))).toBe(180);
  });

  it("walks past somebody who is out, the same as a bot", () => {
    // They are still at the table. They are not about to play.
    const room = roomOf(["Top", false], ["Right", false], ["Bottom", false], ["Left", false]);
    expect(seatToFace(room, gameOf("Top", ["Top", "Right"]))).toBe(2);
  });

  it("stays upright at a table of bots, and before anybody is on the clock", () => {
    const bots = roomOf(["Top", true], ["Right", true], ["Bottom", true], ["Left", true]);
    expect(seatToFace(bots, gameOf("Top"))).toBeNull();
    expect(facingTurn(bots, gameOf("Top"))).toBe(0);

    expect(seatToFace(FOUR, gameOf(null))).toBeNull();
    expect(facingTurn(FOUR, null)).toBe(0);
  });

  it("answers for a seat that is not at this table rather than throwing", () => {
    expect(seatToFace(FOUR, gameOf("Nobody"))).toBeNull();
    expect(facingTurn(roomOf(), gameOf("Top"))).toBe(0);
  });
});
