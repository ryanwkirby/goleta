import { describe, expect, it } from "vitest";

import type { CardSize } from "../src/components/Card.tsx";
import { TABLE_DESIGN, fitScale } from "../src/lib/fitScale.ts";
import { pileBox } from "../src/lib/pileBox.ts";
import { BAND } from "../src/lib/tableEdges.ts";

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
