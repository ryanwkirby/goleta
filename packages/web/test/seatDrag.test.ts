import { describe, expect, it } from "vitest";

import { ROW_STEP, dropIndex, hopsBetween } from "../src/lib/seatDrag.ts";

/**
 * The server's `moveSeat`, near enough: swap with the neighbour one place along,
 * and do nothing at all off either end.
 *
 * Copied rather than imported because the point of the test is that the *web*
 * side never invents an order — it only ever asks for hops, and this is what a
 * hop does when it lands.
 */
const hop = (order: string[], id: string, direction: "up" | "down"): string[] => {
  const from = order.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  next[from] = order[to] as string;
  next[to] = order[from] as string;
  return next;
};

/** What a drag actually sends, played out against a table. */
const drag = (order: string[], id: string, deltaY: number): string[] => {
  const from = order.indexOf(id);
  const want = dropIndex(from, deltaY, order.length);
  const { direction, count } = hopsBetween(from, want);
  let now = order;
  for (let left = count; left > 0; left -= 1) now = hop(now, id, direction);
  return now;
};

const TABLE = ["a", "b", "c", "d", "e"];

describe("where a dragged name lands", () => {
  it("stays put until the pointer has crossed half a row", () => {
    expect(dropIndex(2, 0, 5)).toBe(2);
    expect(dropIndex(2, ROW_STEP / 2 - 1, 5)).toBe(2);
    expect(dropIndex(2, -(ROW_STEP / 2 - 1), 5)).toBe(2);
  });

  it("follows the finger a row at a time", () => {
    expect(dropIndex(0, ROW_STEP, 5)).toBe(1);
    expect(dropIndex(0, ROW_STEP * 3, 5)).toBe(3);
    expect(dropIndex(4, -ROW_STEP * 2, 5)).toBe(2);
  });

  it("stops at the ends rather than refusing, exactly as the wire does", () => {
    expect(dropIndex(0, -ROW_STEP * 9, 5)).toBe(0);
    expect(dropIndex(4, ROW_STEP * 9, 5)).toBe(4);
  });

  it("clamps to the table as it stands now, not as it stood at pointerdown", () => {
    // Two seats left mid-drag. The drop narrows rather than running off the end.
    expect(dropIndex(4, ROW_STEP * 2, 3)).toBe(2);
    expect(dropIndex(0, 0, 0)).toBe(0);
  });
});

describe("the hops a drag owes", () => {
  it("owes nothing for a drag that ended where it started", () => {
    expect(hopsBetween(2, 2).count).toBe(0);
  });

  it("counts places, not pixels", () => {
    expect(hopsBetween(1, 4)).toEqual({ direction: "down", count: 3 });
    expect(hopsBetween(4, 1)).toEqual({ direction: "up", count: 3 });
  });

  it("counts from what we last asked for, not from where the room is", () => {
    // A broadcast still in flight is the case this exists for: having already
    // asked for place 3, a finger now over place 4 owes one more hop and not
    // four.
    expect(hopsBetween(3, 4)).toEqual({ direction: "down", count: 1 });
  });
});

describe("a drag against the arrows", () => {
  it("produces the same order as the equivalent run of arrow taps", () => {
    for (let from = 0; from < TABLE.length; from += 1) {
      for (let to = 0; to < TABLE.length; to += 1) {
        const id = TABLE[from] as string;
        const dragged = drag(TABLE, id, (to - from) * ROW_STEP);

        // The same journey, one arrow tap at a time.
        let tapped = TABLE;
        const direction = to > from ? "down" : "up";
        for (let left = Math.abs(to - from); left > 0; left -= 1) {
          tapped = hop(tapped, id, direction);
        }

        expect(dragged).toEqual(tapped);
      }
    }
  });

  it("moves the name to the place the finger was over, and nobody else out of order", () => {
    expect(drag(TABLE, "e", -ROW_STEP * 3)).toEqual(["a", "e", "b", "c", "d"]);
    expect(drag(TABLE, "a", ROW_STEP * 2)).toEqual(["b", "c", "a", "d", "e"]);
  });

  it("leaves the table alone when the drag went nowhere", () => {
    expect(drag(TABLE, "c", 0)).toEqual(TABLE);
    expect(drag(TABLE, "c", ROW_STEP / 3)).toEqual(TABLE);
  });

  it("cannot post an order built from a table that has moved on", () => {
    // The whole safety argument, stated as a test: every message is "move this
    // seat one place", relative to wherever the server has it. A drag computed
    // against a five-seat table, landing on a table that has lost one, is a
    // name in the wrong place — never a permutation of names that no longer
    // matches who is sitting there.
    const shrunk = ["a", "b", "c", "d"];
    const landed = drag(shrunk, "a", ROW_STEP * 4);

    expect(landed.toSorted()).toEqual(shrunk.toSorted());
    expect(landed).toHaveLength(shrunk.length);
  });
});
