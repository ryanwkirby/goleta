/**
 * Where a card is, on the shared table screen (#200).
 *
 * Almost nothing moved on that board: cards appeared in hands, appeared on the
 * pile, and vanished off the deck. At a table of six with a tablet in the middle
 * that is genuinely hard to follow, which is the one job the screen has.
 *
 * **The planning is not the hard part and is not repeated here.** `motion/plan.ts`
 * is pure and tested and already turns a batch of events into ordered flights
 * with delays, beats, sizes and burst compression — including the deal, which
 * the engine emits no events for, and including the holds a peel and a recycle
 * are entitled to. What it produces are `AnchorKey`s, and what this screen needs
 * is those keys resolved in **design coordinates** rather than from the DOM.
 *
 * So this is the anchor resolution and nothing else. It is pure arithmetic
 * against the same `seatPoint`, `deckPoint` and `pilePoint` the board is drawn
 * from, which is what keeps a card provably arriving where the name is (#164).
 */

import { DECK, HAND, PILE, type AnchorKey } from "./anchors.ts";
import type { Box, Point } from "./fitScale.ts";
import { edgeSeats, seatPoint, type EdgeSeat } from "./tableEdges.ts";

/**
 * How far past the board's own edge a card carries on. The hands are not on this
 * screen, so there is nothing for a flight to land *in*: a drawn card flies out
 * to its player and off, which reads as the card going to them rather than as a
 * card stopping on a name.
 */
const BEYOND = 90;

/** A seat's own edge, just off the board. Measured off `seatPoint` so it is the
 * same place the name is, pushed outwards along that edge's normal. */
export const seatExit = (spot: EdgeSeat, design: Box): Point => {
  const at = seatPoint(spot, design);
  switch (spot.edge) {
    case "top":
      return { x: at.x, y: -BEYOND };
    case "bottom":
      return { x: at.x, y: design.height + BEYOND };
    case "left":
      return { x: -BEYOND, y: at.y };
    case "right":
      return { x: design.width + BEYOND, y: at.y };
  }
};

export interface TablePlaces {
  /** The table in the order it is sitting, which is the order it plays in. */
  seats: readonly { id: string }[];
  deck: Point;
  pile: Point;
  design: Box;
}

/**
 * The first of `keys` that means something on this board, in design pixels.
 *
 * `card:*` and `hand` resolve to nothing here — there are no hands on the
 * default view and no per-card boxes to aim at — and that is safe because
 * `planFlights` always ends its key list with a **region**: `deck`, `pile` or a
 * seat. The same fallback order `resolveAnchor` relies on in the DOM.
 */
export const tablePoint = (keys: readonly AnchorKey[], at: TablePlaces): Point | null => {
  for (const key of keys) {
    if (key === DECK) return at.deck;
    if (key === PILE) return at.pile;
    if (key === HAND) continue;
    if (!key.startsWith("seat:")) continue;

    const id = key.slice("seat:".length);
    const index = at.seats.findIndex((seat) => seat.id === id);
    if (index === -1) continue;
    const spot = edgeSeats(at.seats.length)[index];
    if (spot) return seatExit(spot, at.design);
  }
  return null;
};
