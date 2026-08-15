/**
 * Which way up the shared table screen says things.
 *
 * The seat names have read from outside their own edge since #141, and
 * everything the board says in *words* was still drawn upright, facing whoever
 * happened to be at the bottom. A player at the top read their own name the
 * right way up and the sentence about their own turn upside down (#160).
 *
 * **Two positions, not four**, which is the one place this narrows what #160
 * asked for. A quarter turn is fine for a name — they are short, they sit in a
 * band reserved for them, and `TURN_FOR` already does it. The turn prompt is
 * not short: it carries a Sunny ruling, it is 512 wide, and it lives centred in
 * the bottom band because beside the piles is too narrow to read a ruling in
 * and under them costs the piles the height that becomes the board's width once
 * it is turned. Stood on its end it would need 512 of the 560 the board has and
 * run straight out of both bands.
 *
 * So the board flips rather than spins, which is also the answer #163 takes for
 * the hands view, and it buys the whole of what was actually wrong: nobody is
 * left reading upside down. A player at the side reads at a slant either way,
 * and a slant is not the complaint.
 *
 * Pure arithmetic, no DOM, same as `tableEdges.ts` and for the same reason.
 */

import type { GameView, RoomView } from "@goleta/engine";

import { TABLE_DESIGN } from "./fitScale.ts";
import { edgeSeats, seatPoint } from "./tableEdges.ts";

/**
 * Whose turn the board should be readable from — the seat on the clock, unless
 * that seat is a bot.
 *
 * **Bots are walked past.** Nobody needs the board turned towards a robot, and
 * the person who wants to read it is whoever is up next. Eliminated players are
 * walked past for the same reason: they are at the table, but they are not
 * about to play.
 *
 * Null for a table of bots only, or before anybody is on the clock. `SeatView`
 * carries `bot`, so this is answerable on the client with nothing added to the
 * protocol.
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
 * How far to turn the board's words, in degrees: `180` for somebody sitting
 * across the table, `0` for somebody at this end.
 *
 * Decided by which half of the board the seat's own point falls in rather than
 * by its edge, which is the same answer for the top and bottom and a defined
 * one for the sides — they sit on the midline, so they get the board upright,
 * which is what the rest of the table is reading anyway.
 */
export const facingTurn = (room: RoomView, game: GameView | null): number => {
  const at = seatToFace(room, game);
  if (at === null) return 0;

  const spot = edgeSeats(room.seats.length)[at];
  if (!spot) return 0;

  return seatPoint(spot, TABLE_DESIGN).y < TABLE_DESIGN.height / 2 ? 180 : 0;
};
