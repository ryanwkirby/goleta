/**
 * Where a seat is sitting, as a fraction `[0, 1)` clockwise round the edge of
 * the shared screen's board (#320).
 *
 * `edgeSeats(count)` used to decide the arrangement outright — six seats were
 * always two along the top, one right, two along the bottom, one left, at fixed
 * marks — so a table with three people down one side could not say so, and a
 * drag could only choose which of those fixed marks a name occupied.
 *
 * **Seat order is turn order and stays so for free.** `room.seats` is kept
 * sorted by `spot`, so the ring order *is* the array order and nothing
 * downstream learns any of this exists — #186's clockwise walk is preserved by
 * construction rather than by a spreading table. Every function here either
 * returns a spot or leaves the list sorted.
 *
 * Pure: no `Date.now()`, no randomness, nothing that touches a room. It is
 * arithmetic about a circle.
 */

/** Two seats closer together than this are the same place, and one of them is
 * nudged so the order stays decidable. A board is 1000 design pixels round its
 * longest side, so this is well under a pixel. */
const APART = 0.0005;

/** Into `[0, 1)`, whatever came in — a drag can hand over exactly 1, and a
 * browser can hand over anything. */
export const wrapSpot = (spot: number): number => {
  if (!Number.isFinite(spot)) return 0;
  const at = spot % 1;
  return at < 0 ? at + 1 : at;
};

/** Where `n` seats sit when nobody has arranged them: evenly round the circle,
 * in the order they sat down. */
export const evenSpots = (n: number): number[] =>
  Array.from({ length: Math.max(n, 0) }, (_, index) => index / Math.max(n, 1));

/**
 * Whether a table is still in the arrangement it was dealt out in — evenly
 * spaced, in join order.
 *
 * **This is what stops an IRL feature reordering an online room.** A new seat
 * takes the middle of the largest gap, and on a circle that is not the place
 * that keeps join order: three seats at 0, ½ and ¼ sort into a ring that puts
 * the second bot added ahead of the first, and a host adding four bots would
 * watch them appear in the wrong order for a reason to do with a board they are
 * not using. So a table nobody has arranged is simply re-spaced as it fills,
 * which is exactly what it did before any of this existed; the gap rule takes
 * over the moment somebody has dragged a name, and from then on nothing moves
 * that was not moved on purpose.
 *
 * No extra state to carry, persist or reason about: a table that has been
 * arranged is not evenly spaced, and that is the whole of the question. A table
 * arranged back into even spacing by hand is one this is right about anyway.
 */
export const evenlySpaced = (spots: readonly number[]): boolean => {
  const want = evenSpots(spots.length);
  return spots.every((at, index) => Math.abs(wrapSpot(at) - (want[index] ?? 0)) < APART);
};

/**
 * Where a new seat sits at a table that *has* been arranged: the middle of the
 * largest gap, so somebody sitting down takes the free chair rather than piling
 * up wherever the last person landed.
 *
 * The gaps are circular, so an empty stretch across the top-left corner counts
 * like any other. An empty table starts at 0, which is the middle of the top
 * edge's own quarter.
 */
export const spotForNewSeat = (taken: readonly number[]): number => {
  const spots = taken.map(wrapSpot).toSorted((a, b) => a - b);
  if (spots.length === 0) return 0;
  if (spots.length === 1) return wrapSpot((spots[0] ?? 0) + 0.5);

  let best = 0;
  let widest = -1;
  for (const [index, at] of spots.entries()) {
    // The last gap wraps back to the first seat, which is why this is not a
    // simple pairwise walk.
    const next = spots[(index + 1) % spots.length] ?? at;
    const gap = index === spots.length - 1 ? next + 1 - at : next - at;
    if (gap > widest) {
      widest = gap;
      best = wrapSpot(at + gap / 2);
    }
  }
  return best;
};

/**
 * `spot`, moved off anybody already sitting there. A drop lands on a point, and
 * two seats on the same point have no order between them — which would be a
 * turn order that depends on a sort's stability.
 */
export const clearOf = (spot: number, taken: readonly number[]): number => {
  let at = wrapSpot(spot);
  // At most one nudge per neighbour, and the table is at most eight.
  for (let pass = 0; pass < taken.length + 1; pass += 1) {
    const clash = taken.find((other) => Math.abs(wrapSpot(other) - at) < APART);
    if (clash === undefined) return at;
    at = wrapSpot(at + APART);
  }
  return at;
};
