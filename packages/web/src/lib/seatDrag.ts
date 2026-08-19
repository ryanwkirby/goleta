/**
 * Dragging a name up and down the lobby's seat list (#197).
 *
 * Seat order is turn order, and in an IRL room the host fixes it against where
 * people are actually sitting. Eight names by two arrows apiece is a lot of
 * taps, each moving one place, with the list shifting under you between them.
 *
 * **A drag is a run of the message that already exists.** `moveSeat` is
 * deliberately one place at a time, and `docs/PROTOCOL.md` says why: an order
 * posted from a browser can arrive after a seat has left, and a stale
 * permutation is a worse thing to reconcile than a swap that no longer applies.
 * That reasoning is still right, so a drop three places up sends three hops.
 * Each is independently valid, each is applied or refused on its own merits,
 * and nothing new goes on the wire.
 *
 * It is also what makes a list that changes mid-drag safe. A hop is relative to
 * wherever the server currently has that seat, so the worst a stale index can
 * do is send the wrong *number* of hops — a name one place out, on screen,
 * fixable with the arrows. It can never post a permutation built from a table
 * that has since moved on.
 *
 * Pure arithmetic, no DOM, same as `fan.ts` and `handFan.ts`: what a drag does
 * at any distance is a test rather than a squint at a phone.
 */

/**
 * How far apart two seat rows are: `min-h-16` and the `space-y-1.5` under it.
 *
 * The one number in here that has to stay in step with the markup, and the
 * reason a drag measures against it rather than against the rows' own rects:
 * the list **reorders under the finger** as each hop lands, so a rect read
 * mid-drag is a rect that has already moved. How far the pointer has travelled
 * from where it went down has not.
 */
export const ROW_STEP = 64 + 6;

/**
 * Which place the finger is over, given where it started and how far it has
 * come.
 *
 * Clamped to the table as it stands *now* rather than as it stood when the drag
 * began, so a seat leaving mid-drag narrows the target rather than allowing a
 * drop past the end. Off either end is the last place rather than a refusal,
 * which is the same answer `moveSeat` gives on the wire.
 */
export const dropIndex = (from: number, deltaY: number, seats: number): number => {
  if (seats <= 0) return 0;
  const travelled = Math.round(deltaY / ROW_STEP);
  return Math.min(Math.max(from + travelled, 0), seats - 1);
};

/**
 * A drag in progress. `at` is where we have told the server the seat should be,
 * not where the room says it is — see `hopsBetween`.
 */
export interface SeatDrag {
  id: string;
  /** Where the pointer went down, so travel is measured from a fixed point. */
  startY: number;
  /** The seat's place when the drag began. */
  from: number;
  at: number;
}

export interface Hops {
  direction: "up" | "down";
  /** How many single-place messages this drag owes. Zero for no movement. */
  count: number;
}

/**
 * The hops between where we have told the server the seat should be and where
 * the finger now is.
 *
 * Against our own last instruction, not against the room's current order.
 * Those differ for as long as a broadcast is in flight, and tracking intent is
 * what stops a slow round trip being read as "it hasn't moved yet, send it
 * again".
 */
export const hopsBetween = (at: number, want: number): Hops => ({
  direction: want > at ? "down" : "up",
  count: Math.abs(want - at),
});
