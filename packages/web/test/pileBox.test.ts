import { describe, expect, it } from "vitest";

import { CARD_HEIGHT_PX, type CardSize } from "../src/lib/cardShape.ts";
import { TABLE_DESIGN, fitScale } from "../src/lib/fitScale.ts";
import { deckPoint, pileBox, pilePoint } from "../src/lib/pileBox.ts";
import { BAND, edgeSeats, seatPoint } from "../src/lib/tableEdges.ts";

/** The two boxes `TableScreen` gives the piles, kept in step with the constants
 * there by hand. */
const GUTTER = 10;
const CENTRE = {
  width: TABLE_DESIGN.width - BAND.side * 2 - GUTTER * 2,
  height: TABLE_DESIGN.height - BAND.top - BAND.bottom - GUTTER * 2,
};
const HANDS = { width: TABLE_DESIGN.width - 40, height: 240 };

/** The point the centre view centres its piles on — symmetric, so the middle. */
const CENTRE_AT = {
  x: TABLE_DESIGN.width / 2,
  y: (BAND.top + (TABLE_DESIGN.height - BAND.bottom)) / 2,
};

const EVERY_SIZE: CardSize[] = ["sm", "md", "lg", "xl", "2xl"];

/** How much the piles paint once they have been fitted to `room`. */
const painted = (room: { width: number; height: number }, size: CardSize) => {
  const box = pileBox(size);
  const scale = fitScale(room, box);
  return { width: box.width * scale, height: box.height * scale };
};

describe("fitting the centre piles into the room the board has", () => {
  it("never paints into the bands the seat names live in", () => {
    // The bug this exists for: `scale-[2.5]` is a paint transform, so the piles were
    // laid out at 198px, centred in the full height of the design, and the ink then
    // grew into the top band under somebody's name (#159). Asked at every card
    // size, because the guarantee is about the arithmetic.
    for (const size of EVERY_SIZE) {
      const { width, height } = painted(CENTRE, size);
      expect(height).toBeLessThanOrEqual(CENTRE.height + 0.001);
      expect(width).toBeLessThanOrEqual(CENTRE.width + 0.001);
    }
  });

  it("leaves the piles clear of the names rather than flush against them", () => {
    // Fitted to the band edge exactly, the piles start at y=48 and the top name ends
    // at 46.5 — which across a room reads as the collision this was meant to fix.
    const { height } = painted(CENTRE, "xl");
    const clearOfBand = (TABLE_DESIGN.height - height) / 2 - BAND.top;
    expect(clearOfBand).toBeGreaterThanOrEqual(GUTTER - 0.001);
  });

  it("keeps the hands view's piles inside the slot above the seat strip", () => {
    for (const size of EVERY_SIZE) {
      const { width, height } = painted(HANDS, size);
      expect(height).toBeLessThanOrEqual(HANDS.height + 0.001);
      expect(width).toBeLessThanOrEqual(HANDS.width + 0.001);
    }
  });

  it("takes all of the room it is given in one direction", () => {
    // `fitScale` is the smaller of the two ratios, so one axis is always exactly
    // filled. If neither is, the piles are smaller than the board can afford.
    for (const room of [CENTRE, HANDS]) {
      const { width, height } = painted(room, "xl");
      const snug =
        Math.abs(width - room.width) < 0.001 || Math.abs(height - room.height) < 0.001;
      expect(snug).toBe(true);
    }
  });

  it("throws a drawn card from the deck towards the seat that drew it", () => {
    // Both ends of the vector used to be wrong: it started at the middle of the
    // design box, which is not where the deck is, and finished on one of four fixed
    // offsets, so on any table of five or more it was thrown at the midpoint
    // between two people (#164).
    const from = deckPoint(CENTRE, CENTRE_AT, "xl");

    for (const count of [4, 5, 6, 7, 8]) {
      for (const spot of edgeSeats(count)) {
        const to = seatPoint(spot, TABLE_DESIGN);
        const dx = to.x - from.x;
        const dy = to.y - from.y;

        // Whichever edge they are on, that is the way the card goes.
        if (spot.edge === "top") expect(dy).toBeLessThan(0);
        if (spot.edge === "bottom") expect(dy).toBeGreaterThan(0);
        if (spot.edge === "left") expect(dx).toBeLessThan(0);
        if (spot.edge === "right") expect(dx).toBeGreaterThan(0);
      }
    }
  });

  it("sends two seats sharing an edge to different places", () => {
    const from = deckPoint(CENTRE, CENTRE_AT, "xl");
    const seen = new Map<string, string[]>();

    for (const spot of edgeSeats(8)) {
      const to = seatPoint(spot, TABLE_DESIGN);
      const vector = `${(to.x - from.x).toFixed(1)},${(to.y - from.y).toFixed(1)}`;
      seen.set(spot.edge, [...(seen.get(spot.edge) ?? []), vector]);
    }

    // Eight seats is two per edge, and no edge may throw both cards along one line.
    for (const [, vectors] of seen) {
      expect(vectors).toHaveLength(2);
      expect(new Set(vectors).size).toBe(2);
    }
  });

  it("puts the deck to the left of the pile box's centre, and level with it", () => {
    // The two cards and their gap are centred in the box and the deck is the left of
    // the pair. Get that wrong and the card in the air leaves from somewhere the
    // deck is not. The vertical offset was the caption hanging under both cards, and
    // it went with the caption (#335): the box is a card tall now, so the pair sits
    // on the centre line.
    const at = deckPoint(CENTRE, CENTRE_AT, "xl");
    expect(at.x).toBeLessThan(CENTRE_AT.x);
    expect(at.y).toBe(CENTRE_AT.y);
    expect(pilePoint(CENTRE, CENTRE_AT, "xl").y).toBe(CENTRE_AT.y);
  });

  it("reserves a box exactly as tall as the cards it paints", () => {
    // The caption was 22px of this height and it is gone. Left behind, the piles
    // would be fitted against a box taller than they paint and every flight would
    // leave and land 11px off (#335).
    for (const size of EVERY_SIZE) {
      expect(pileBox(size).height).toBe(CARD_HEIGHT_PX[size]);
    }
  });

  it("allows for the suit circle on both sides, so centring cannot hand it back", () => {
    // The piles are centred, so counting the twelve-pixel overhang only once would
    // move the box's centre away from the piles' and put the ink straight back
    // outside — 24px of allowance, 12 deliberately unused on the left.
    expect(pileBox("xl").width - (132 * 2 + 24)).toBe(24);
    expect(pileBox("lg").width - (96 * 2 + 24)).toBe(24);
  });
});
