/**
 * Where a card is on the shared table screen (#200).
 *
 * The planning is `motion/plan.ts`'s and is tested there; this is the anchor
 * resolution, which is the whole of what that screen needed to acquire movement.
 */

import { describe, expect, it } from "vitest";

import { DECK, HAND, PILE, cardAnchor, seatAnchor } from "../src/lib/anchors.ts";
import { TABLE_DESIGN } from "../src/lib/fitScale.ts";
import { edgeSeats, seatPoint } from "../src/lib/tableEdges.ts";
import { seatExit, tablePoint } from "../src/lib/tableFlight.ts";

/** A table nobody has arranged — evenly round the circle, in join order (#320). */
const seats = (count: number): { id: string; spot: number }[] =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}`, spot: index / count }));

const sitting = (count: number): number[] => seats(count).map((seat) => seat.spot);

const places = (count = 4) => ({
  seats: seats(count),
  deck: { x: 420, y: 280 },
  pile: { x: 580, y: 280 },
  design: TABLE_DESIGN,
});

describe("a seat's own edge, just off the board", () => {
  it("leaves the board on the side that seat is sitting on", () => {
    const spots = edgeSeats(sitting(4));
    for (const spot of spots) {
      const exit = seatExit(spot, TABLE_DESIGN);
      const name = seatPoint(spot, TABLE_DESIGN);
      // Out past the edge, and level with the name on the other axis — the hands
      // are not on this screen, so a drawn card goes to its player and off.
      if (spot.edge === "top") expect(exit.y).toBeLessThan(0);
      if (spot.edge === "bottom") expect(exit.y).toBeGreaterThan(TABLE_DESIGN.height);
      if (spot.edge === "left") expect(exit.x).toBeLessThan(0);
      if (spot.edge === "right") expect(exit.x).toBeGreaterThan(TABLE_DESIGN.width);
      if (spot.edge === "top" || spot.edge === "bottom") expect(exit.x).toBe(name.x);
      if (spot.edge === "left" || spot.edge === "right") expect(exit.y).toBe(name.y);
    }
  });
});

describe("resolving a flight's ends on the board", () => {
  it("answers the two piles by name", () => {
    const at = places();
    expect(tablePoint([DECK], at)).toEqual(at.deck);
    expect(tablePoint([PILE], at)).toEqual(at.pile);
  });

  it("sends a seat's card off that seat's own edge", () => {
    const at = places();
    const spots = edgeSeats(sitting(4));
    for (const [index, spot] of spots.entries()) {
      const key = seatAnchor(`p${index + 1}`);
      expect(tablePoint([key], at)).toEqual(seatExit(spot, TABLE_DESIGN));
    }
  });

  it("falls through what this board does not draw, to the region behind it", () => {
    const at = places();
    // `planFlights` always ends its key list with a region, which is what makes
    // this safe: there are no per-card boxes here and no hand of your own.
    expect(tablePoint([cardAnchor("7S#1"), seatAnchor("p2")], at)).toEqual(
      tablePoint([seatAnchor("p2")], at),
    );
    expect(tablePoint([HAND, PILE], at)).toEqual(at.pile);
  });

  it("answers nothing for a seat that has left, rather than the wrong place", () => {
    const at = places();
    expect(tablePoint([seatAnchor("nobody")], at)).toBeNull();
    expect(tablePoint([cardAnchor("7S#1")], at)).toBeNull();
    expect(tablePoint([], at)).toBeNull();
  });

  it("takes the piles from the caller, so a card leaves the deck on screen", () => {
    // The two views put the piles in different places, and a card in the air has
    // to come off the deck that is actually being looked at (#164).
    const hands = { ...places(), deck: { x: 100, y: 40 } };
    expect(tablePoint([DECK], hands)).toEqual({ x: 100, y: 40 });
  });
});
