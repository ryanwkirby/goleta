import { describe, expect, it } from "vitest";

import { TABLE_DESIGN } from "../src/lib/fitScale.ts";
import { flungOffset, restingAt, spotAt, THRESHOLD } from "../src/lib/seatFling.ts";
import { edgeAt, edgeSeats, seatPoint } from "../src/lib/tableEdges.ts";

const D = TABLE_DESIGN;

/** A table nobody has arranged — evenly round the circle, in join order, which
 * is what the server hands out until somebody drags a name (#320). */
const sitting = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index / count);

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
      for (const [index, spot] of edgeSeats(sitting(count)).entries()) {
        expect(restingAt(index, sitting(count), D)).toEqual(seatPoint(spot, D));
      }
    }
    expect(restingAt(8, sitting(6), D)).toBeNull();
  });

  it("follows the finger exactly while it is on the board", () => {
    const anchor = restingAt(0, sitting(6), D)!;
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
    const anchor = restingAt(3, sitting(6), D)!;
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
    const anchor = restingAt(1, sitting(6), D)!;
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
    const anchor = restingAt(2, sitting(5), D)!;
    const grab = { x: anchor.x - 4, y: anchor.y + 3 };
    expect(flungOffset(anchor, grab, grab, D)).toEqual({ x: 0, y: 0 });
  });

  /**
   * What the drop then says. **A place rather than a distance** (#320): one
   * `placeSeat` carrying where this seat now is, which says nothing about
   * anybody else and so cannot arrive stale in a way that needs reconciling. It
   * used to be a run of hops, which meant first working out which existing seat
   * the drop landed nearest — a question about everybody else.
   */
  it("reads a drop as the direction it is in from the middle of the board", () => {
    const middle = { x: D.width / 2, y: D.height / 2 };
    // Straight up is the middle of the top edge, which is an eighth of the way
    // round a ring that starts at the top-left corner.
    expect(spotAt({ x: middle.x, y: 0 }, D)).toBeCloseTo(0.125, 6);
    expect(spotAt({ x: D.width, y: middle.y }, D)).toBeCloseTo(0.375, 6);
    expect(spotAt({ x: middle.x, y: D.height }, D)).toBeCloseTo(0.625, 6);
    expect(spotAt({ x: 0, y: middle.y }, D)).toBeCloseTo(0.875, 6);
  });

  it("puts the four corners on the four boundaries between edges", () => {
    // Squared to the design box first, or a board wider than it is tall puts its
    // corners in the wrong quarters.
    expect(spotAt({ x: 0, y: 0 }, D)).toBeCloseTo(0, 6);
    expect(spotAt({ x: D.width, y: 0 }, D)).toBeCloseTo(0.25, 6);
    expect(spotAt({ x: D.width, y: D.height }, D)).toBeCloseTo(0.5, 6);
    expect(spotAt({ x: 0, y: D.height }, D)).toBeCloseTo(0.75, 6);
  });

  it("answers inside the ring wherever the finger went", () => {
    for (const point of [
      { x: -900, y: -900 },
      { x: 5000, y: 5000 },
      { x: D.width / 2, y: D.height / 2 },
      { x: 1, y: D.height - 1 },
    ]) {
      const at = spotAt(point, D);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(1);
    }
  });

  it("lands a name on the edge it was dropped over", () => {
    const near: [{ x: number; y: number }, string][] = [
      [{ x: D.width / 2, y: 20 }, "top"],
      [{ x: D.width - 20, y: D.height / 2 }, "right"],
      [{ x: D.width / 2, y: D.height - 20 }, "bottom"],
      [{ x: 20, y: D.height / 2 }, "left"],
    ];
    for (const [point, edge] of near) expect(edgeAt(spotAt(point, D))).toBe(edge);
  });

  it("sends a name dropped where it already sits back to its own edge", () => {
    // Letting go without moving anywhere must not move anybody.
    for (const count of [4, 6, 8]) {
      for (const spot of edgeSeats(sitting(count))) {
        expect(edgeAt(spotAt(seatPoint(spot, D), D))).toBe(spot.edge);
      }
    }
  });

  it("needs a real gesture before any of that runs", () => {
    // A drink put down on the board travels nothing like this far.
    expect(THRESHOLD).toBeGreaterThan(50);
    const anchor = restingAt(0, sitting(6), D)!;
    const nudge = { x: anchor.x + 8, y: anchor.y + 8 };
    expect(Math.hypot(nudge.x - anchor.x, nudge.y - anchor.y)).toBeLessThan(THRESHOLD);
  });
});
