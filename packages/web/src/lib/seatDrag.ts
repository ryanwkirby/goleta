/**
 * Dragging a name up and down the lobby's seat list (#197).
 *
 * **A drag is a run of the message that already exists.** `moveSeat` is one
 * place at a time because an order posted from a browser can arrive after a seat
 * has left, so a drop three places up sends three hops. It is also what makes a
 * list that changes mid-drag safe: a hop is relative to wherever the server has
 * that seat, so the worst a stale index does is send the wrong *number* of hops.
 */

/**
 * How far apart two seat rows are: `min-h-16` plus `space-y-1.5`. Has to stay in
 * step with the markup, and it is why a drag measures against it rather than the
 * rows' own rects — the list reorders under the finger, so a rect read mid-drag
 * has already moved.
 */
export const ROW_STEP = 64 + 6;

/** Clamped to the table as it stands *now*, so a seat leaving mid-drag narrows
 * the target. Off either end is the last place rather than a refusal, the same
 * answer `moveSeat` gives on the wire. */
export const dropIndex = (from: number, deltaY: number, seats: number): number => {
  if (seats <= 0) return 0;
  const travelled = Math.round(deltaY / ROW_STEP);
  return Math.min(Math.max(from + travelled, 0), seats - 1);
};

/** `at` is where we have told the server the seat should be, not where the room
 * says it is — see `hopsBetween`. */
export interface SeatDrag {
  id: string;
  startY: number;
  /** The seat's place when the drag began. */
  from: number;
  at: number;
}

export interface Hops {
  direction: "up" | "down";
  /** How many single-place messages this drag owes. */
  count: number;
}

/** Against our own last instruction rather than the room's current order: those
 * differ while a broadcast is in flight, and tracking intent is what stops a
 * slow round trip reading as "it hasn't moved, send it again". */
export const hopsBetween = (at: number, want: number): Hops => ({
  direction: want > at ? "down" : "up",
  count: Math.abs(want - at),
});
