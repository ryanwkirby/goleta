import { describe, expect, it } from "vitest";

import type { CardSize } from "../src/lib/cardShape.ts";
import { TABLE_DESIGN, fitScale } from "../src/lib/fitScale.ts";
import { deckPoint, pileBox } from "../src/lib/pileBox.ts";
import { BAND, edgeSeats, seatPoint } from "../src/lib/tableEdges.ts";

/**
 * The two boxes `TableScreen` gives the piles, kept in step with the constants
 * there by hand. Both are stated the same way the screen states them: the room
 * between the bands, and the slot the hands view keeps above the seat strip.
 */
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
    // The bug this exists for: `scale-[2.5]` is a paint transform, so the flex
    // box centring the piles laid them out at 198px, centred *that* in the full
    // height of the design, and the ink then grew about its own middle — into
    // the top band, under the name of whoever was sitting there (#159).
    //
    // Asked at every card size, not just the one the screen uses, because the
    // guarantee is about the arithmetic rather than about today's choice.
    for (const size of EVERY_SIZE) {
      const { width, height } = painted(CENTRE, size);
      expect(height).toBeLessThanOrEqual(CENTRE.height + 0.001);
      expect(width).toBeLessThanOrEqual(CENTRE.width + 0.001);
    }
  });

  it("leaves the piles clear of the names rather than flush against them", () => {
    // Fitted to the band edge exactly, the piles start at design y=48 and the
    // top name ends at 46.5 — a pixel and a half apart, which on a screen
    // across a room reads as the collision this was meant to fix. The gutter is
    // what makes "not overlapping" look like it.
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
    // `fitScale` is the smaller of the two ratios, so one axis is always
    // exactly filled. If neither is, something has been left on the table and
    // the piles are smaller than the board can afford — which on a screen
    // propped across a room is the whole subject.
    for (const room of [CENTRE, HANDS]) {
      const { width, height } = painted(room, "xl");
      const snug =
        Math.abs(width - room.width) < 0.001 || Math.abs(height - room.height) < 0.001;
      expect(snug).toBe(true);
    }
  });

  it("throws a drawn card from the deck towards the seat that drew it", () => {
    // Both the vector's ends used to be wrong. It started at the middle of the
    // design box, which is not where the deck is, and it finished on one of
    // four fixed offsets — so on any table of five or more, where an edge holds
    // two seats, the card was thrown at the midpoint between two people and
    // towards neither of them (#164).
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

    // Eight seats is two per edge, and no edge may throw both of its cards
    // along the same line.
    for (const [, vectors] of seen) {
      expect(vectors).toHaveLength(2);
      expect(new Set(vectors).size).toBe(2);
    }
  });

  it("puts the deck to the left of the pile box's centre, and a little above it", () => {
    // The two cards and their gap are centred in the box and the deck is the
    // left of the pair; the caption hangs under both, so the cards' middle sits
    // above the box's. Neither is a guess — get either wrong and the card in
    // the air leaves from somewhere the deck is not.
    const at = deckPoint(CENTRE, CENTRE_AT, "xl");
    expect(at.x).toBeLessThan(CENTRE_AT.x);
    expect(at.y).toBeLessThan(CENTRE_AT.y);
  });

  it("allows for the suit circle on both sides, so centring cannot hand it back", () => {
    // The circle hangs twelve pixels off the right-hand edge of the card in
    // play. The piles are centred in the box, so counting the overhang only
    // once would move the box's centre away from the piles' centre and put the
    // ink straight back outside — 24px of allowance, 12 of it deliberately
    // unused on the left.
    expect(pileBox("xl").width - (132 * 2 + 24)).toBe(24);
    expect(pileBox("lg").width - (96 * 2 + 24)).toBe(24);
  });
});
