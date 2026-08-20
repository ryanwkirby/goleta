/**
 * Which way up the shared table screen says things. The seat names have read
 * from outside their own edge since #141 while everything said in *words* was
 * drawn upright, so a player at the top read their own name the right way up and
 * the sentence about their own turn upside down (#160).
 *
 * **Two positions, not four.** The turn prompt carries a Sunny ruling and is 512
 * wide, so stood on its end it would need 512 of the 560 the board has.
 */

import type { GameView, RoomView } from "@goleta/engine";

import { TABLE_DESIGN } from "./fitScale.ts";
import { edgeSeats, seatPoint } from "./tableEdges.ts";

/**
 * Whose turn the board should be readable from — the seat on the clock, unless
 * it is a bot or somebody eliminated: the person who wants to read it is whoever
 * is up next. Null for a table of bots only.
 */
export const seatToFace = (room: RoomView, game: GameView | null): number | null => {
  if (!game || game.waitingOn === null) return null;

  const from = room.seats.findIndex((seat) => seat.id === game.waitingOn);
  if (from < 0) return null;

  const out = new Set(
    game.players.filter((player) => player.eliminated).map((player) => player.id),
  );

  for (let step = 0; step < room.seats.length; step += 1) {
    const at = (from + step) % room.seats.length;
    const seat = room.seats[at];
    if (seat && !seat.bot && !out.has(seat.id)) return at;
  }
  return null;
};

/**
 * `180` for somebody across the table, `0` for somebody at this end. Decided by
 * which half of the board the seat's point falls in rather than by its edge,
 * which gives the sides a defined answer — they sit on the midline and get the
 * board upright, which is what the rest of the table is reading anyway.
 */
export const facingTurn = (room: RoomView, game: GameView | null): number => {
  const at = seatToFace(room, game);
  if (at === null) return 0;

  const spot = edgeSeats(room.seats.length)[at];
  if (!spot) return 0;

  return seatPoint(spot, TABLE_DESIGN).y < TABLE_DESIGN.height / 2 ? 180 : 0;
};
