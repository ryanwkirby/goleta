import { describe, expect, it } from "vitest";

import { TABLE_DESIGN } from "../src/lib/fitScale.ts";
import { flungOffset, restingAt, THRESHOLD } from "../src/lib/seatFling.ts";
import { hopsBetween } from "../src/lib/seatDrag.ts";
import { edgeSeats, nearestSeat, seatPoint } from "../src/lib/tableEdges.ts";

const D = TABLE_DESIGN;

/** Where a held label is actually drawn: its resting point plus the offset. */
const drawnAt = (anchor: { x: number; y: number }, offset: { x: number; y: number }) => ({
  x: anchor.x + offset.x,
  y: anchor.y + offset.y,
});

describe("a name being dragged round the shared screen", () => {
  it("sits where the board already draws it", () => {
    // The same point a card drawn by that seat is thrown at (#164): two things
    // aiming at a seat must not each have their own idea of where it is.
    for (const count of [4, 5, 6, 7, 8]) {
      for (const [index, spot] of edgeSeats(count).entries()) {
        expect(restingAt(index, count, D)).toEqual(seatPoint(spot, D));
      }
    }
    expect(restingAt(8, 6, D)).toBeNull();
  });

  it("follows the finger exactly while it is on the board", () => {
    const anchor = restingAt(0, 6, D)!;
    const grab = { x: anchor.x, y: anchor.y };

    for (const pointer of [
      { x: 500, y: 280 },
      { x: 120, y: 400 },
      { x: 880, y: 90 },
    ]) {
      expect(drawnAt(anchor, flungOffset(anchor, grab, pointer, D))).toEqual(pointer);
    }
  });

  /**
   * The bug this exists for: committing mid-drag reset the offset to zero on the
   * promise that the label "is about to be redrawn at its new spot", which only
   * happened a round trip later. Nothing here can reset — there is one offset,
   * measured from one grab, for the whole gesture — so the check that matters is
   * that the error cannot grow with the length of the drag.
   */
  it("never drifts from the finger, however far it is dragged", () => {
    const anchor = restingAt(3, 6, D)!;
    const grab = { x: anchor.x + 12, y: anchor.y - 7 };

    let worst = 0;
    for (let step = 0; step <= 60; step += 1) {
      const pointer = { x: 60 + step * 14, y: 80 + step * 6 };
      const drawn = drawnAt(anchor, flungOffset(anchor, grab, pointer, D));
      // The label keeps the same grip it was picked up with: the gap between the
      // finger and the label's centre is what it was at the grab, and stays there.
      worst = Math.max(worst, Math.hypot(drawn.x - pointer.x, drawn.y - pointer.y));
    }
    expect(worst).toBeCloseTo(Math.hypot(anchor.x - grab.x, anchor.y - grab.y), 6);
  });

  it("keeps the label on the board when the finger leaves it", () => {
    const anchor = restingAt(1, 6, D)!;
    const grab = { x: anchor.x, y: anchor.y };

    for (const pointer of [
      { x: -400, y: -900 },
      { x: 5000, y: 5000 },
      { x: 500, y: -26 },
      { x: -1, y: 300 },
    ]) {
      const drawn = drawnAt(anchor, flungOffset(anchor, grab, pointer, D));
      expect(drawn.x).toBeGreaterThanOrEqual(0);
      expect(drawn.y).toBeGreaterThanOrEqual(0);
      expect(drawn.x).toBeLessThanOrEqual(D.width);
      expect(drawn.y).toBeLessThanOrEqual(D.height);
    }
  });

  it("leaves a name exactly where it was when nothing has moved", () => {
    const anchor = restingAt(2, 5, D)!;
    const grab = { x: anchor.x - 4, y: anchor.y + 3 };
    expect(flungOffset(anchor, grab, grab, D)).toEqual({ x: 0, y: 0 });
  });

  /**
   * What the drop then does with the pointer. The hops are counted from where the
   * room says the seat is, because nothing has been sent during the gesture —
   * there is no instruction of our own in flight to count from instead (#321).
   */
  it("lands the seat on the edge the finger was over", () => {
    for (const count of [4, 6, 8]) {
      for (const [from, spot] of edgeSeats(count).entries()) {
        const dropped = seatPoint(spot, D);
        const want = nearestSeat(dropped, count, D);
        expect(want).toBe(from);
        expect(hopsBetween(from, want).count).toBe(0);
      }
    }
  });

  it("counts one hop per place between where a seat is and where it was dropped", () => {
    const count = 6;
    const spots = edgeSeats(count);
    const dropped = seatPoint(spots[4]!, D);
    const { direction, count: hops } = hopsBetween(1, nearestSeat(dropped, count, D));
    expect(direction).toBe("down");
    expect(hops).toBe(3);
  });

  it("needs a real gesture before any of that runs", () => {
    // A drink put down on the board travels nothing like this far.
    expect(THRESHOLD).toBeGreaterThan(50);
    const anchor = restingAt(0, 6, D)!;
    const nudge = { x: anchor.x + 8, y: anchor.y + 8 };
    expect(Math.hypot(nudge.x - anchor.x, nudge.y - anchor.y)).toBeLessThan(THRESHOLD);
  });
});
