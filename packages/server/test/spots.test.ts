import { describe, expect, it } from "vitest";

import { clearOf, evenlySpaced, evenSpots, spotForNewSeat, wrapSpot } from "../src/spots.ts";

describe("where a seat sits round the board", () => {
  it("wraps anything a browser can send into the circle", () => {
    expect(wrapSpot(0)).toBe(0);
    expect(wrapSpot(0.25)).toBe(0.25);
    // A drag that reaches the very end of the perimeter is the start of it.
    expect(wrapSpot(1)).toBe(0);
    expect(wrapSpot(1.25)).toBe(0.25);
    expect(wrapSpot(-0.25)).toBe(0.75);
    expect(wrapSpot(Number.NaN)).toBe(0);
    expect(wrapSpot(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("seats the first four people one to an edge", () => {
    // Middle of the largest gap each time, so a table spreads out as it fills
    // rather than piling up wherever the last person landed.
    const spots: number[] = [];
    for (let seat = 0; seat < 4; seat += 1) spots.push(spotForNewSeat(spots));
    expect(spots.toSorted((a, b) => a - b)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("keeps filling the widest stretch, all the way to a full table", () => {
    const spots: number[] = [];
    for (let seat = 0; seat < 8; seat += 1) {
      const next = spotForNewSeat(spots);
      // Never on top of somebody already sitting down.
      for (const other of spots) expect(Math.abs(other - next)).toBeGreaterThan(0.001);
      spots.push(next);
    }
    expect(spots).toHaveLength(8);
    for (const at of spots) {
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(1);
    }
  });

  it("counts the gap that wraps past the corner like any other", () => {
    // Three seats bunched at the start: the empty three-quarters is the gap, and
    // it runs across the top-left corner rather than stopping at it.
    const bunched = [0, 0.05, 0.1];
    const next = spotForNewSeat(bunched);
    expect(next).toBeGreaterThan(0.5);
    expect(next).toBeLessThan(0.6);
  });

  it("puts the second seat opposite the first, wherever the first is", () => {
    expect(spotForNewSeat([0])).toBeCloseTo(0.5, 9);
    expect(spotForNewSeat([0.8])).toBeCloseTo(0.3, 9);
  });

  it("moves a drop off anybody already sitting there", () => {
    // Two seats on one point have no order between them, which would be a turn
    // order that depended on a sort's stability.
    expect(clearOf(0.25, [0.5, 0.75])).toBe(0.25);
    expect(clearOf(0.25, [0.25])).toBeGreaterThan(0.25);
    expect(clearOf(0.25, [0.25])).toBeLessThan(0.26);
    // And keeps moving until it is clear of all of them.
    const crowd = [0.25, 0.2505, 0.251];
    const placed = clearOf(0.25, crowd);
    for (const other of crowd) expect(Math.abs(other - placed)).toBeGreaterThanOrEqual(0.0005);
  });

  it("answers inside the circle even when it has to nudge past the end", () => {
    const placed = clearOf(0.9999, [0.9999]);
    expect(placed).toBeGreaterThanOrEqual(0);
    expect(placed).toBeLessThan(1);
  });

  it("knows a table nobody has arranged from one that has", () => {
    // The question that stops an IRL feature reordering an online room: a table
    // still in the arrangement it was dealt out in is re-spaced as it fills, and
    // one somebody has dragged is left alone.
    expect(evenlySpaced([])).toBe(true);
    expect(evenlySpaced(evenSpots(1))).toBe(true);
    expect(evenlySpaced(evenSpots(6))).toBe(true);
    expect(evenlySpaced([0, 0.5, 0.75])).toBe(false);
    expect(evenlySpaced([0, 0.34, 0.66])).toBe(false);
    // Order matters, not just the set: these are the right places in the wrong
    // seats, which is a table that has been arranged.
    expect(evenlySpaced([0, 0.75, 0.5, 0.25])).toBe(false);
  });

  it("spaces a table evenly, in the order people sat down", () => {
    expect(evenSpots(4)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(evenSpots(0)).toEqual([]);
    expect(evenSpots(1)).toEqual([0]);
    for (const n of [2, 3, 5, 6, 7, 8]) {
      const spots = evenSpots(n);
      expect(spots).toHaveLength(n);
      // Ascending, so the array is already the ring.
      for (let i = 1; i < n; i += 1) expect(spots[i]!).toBeGreaterThan(spots[i - 1]!);
      expect(evenlySpaced(spots)).toBe(true);
    }
  });
});