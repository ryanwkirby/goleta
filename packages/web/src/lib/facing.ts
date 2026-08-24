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

import { edgeSeats, spotsOf } from "./tableEdges.ts";

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
 * `180` for somebody across the table, `0` for somebody at this end.
 *
 * **Decided by the edge.** It used to ask which half of the board the seat's
 * point fell in, which gave the sides an answer only because they sat exactly on
 * the midline — and they stopped doing that the moment the places were computed
 * from the label rather than written down, because the bottom band is deeper than
 * the top one and the middle of a side's *span* is a little above the middle of
 * its edge (#320). A pixel of asymmetry turned both side seats upside down.
 *
 * The edge says it outright and cannot drift: the top reads from across the
 * table, everybody else reads from this end. The sides read at a slant either
 * way, which was never the complaint, so they get what the rest of the table is
 * reading anyway.
 */
export const facingTurn = (room: RoomView, game: GameView | null): number => {
  const at = seatToFace(room, game);
  if (at === null) return 0;

  return edgeSeats(spotsOf(room.seats))[at]?.edge === "top" ? 180 : 0;
};
