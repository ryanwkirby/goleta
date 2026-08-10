import { describe, expect, it } from "vitest";

import { TABLE_DESIGN } from "../src/lib/fitScale.ts";
import { BAND, edgeFor, edgeSeats, LABEL, TURN_FOR, type Edge } from "../src/lib/tableEdges.ts";

/** The one measurement `TableScreen` owns: `max-w-104` on the prompt, centred. */
const PROMPT = 416;

const MIN_SEATS = 4;
const MAX_SEATS = 8;
const everyTable = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i);

/** The span a label covers along its own edge, at its widest. */
const span = (along: number, edge: Edge): [number, number] => {
  const length = edge === "top" || edge === "bottom" ? TABLE_DESIGN.width : TABLE_DESIGN.height;
  const middle = (along / 100) * length;
  return [middle - LABEL / 2, middle + LABEL / 2];
};

const overlaps = ([a, b]: [number, number], [c, d]: [number, number]): boolean => a < d && c < b;

describe("naming the seats round a shared table screen", () => {
  it("reads each name from outside the edge it is on", () => {
    // The whole point, and it was 180° out on all four sides until #141: the
    // top name was drawn upright, which is what somebody at the *bottom* of the
    // table sees. Bottom is the one that is already the right way up.
    expect(TURN_FOR.bottom).toBe(0);
    expect(TURN_FOR.top).toBe(180);
    // A quarter turn each, in the direction you would walk round the table.
    expect(TURN_FOR.left).toBe(90);
    expect(TURN_FOR.right).toBe(-90);
  });

  it("walks the seats round the table in turn order", () => {
    // Seat order is turn order, so play sweeps round the board rather than
    // hopping across it — which is also what makes a drawn card fly towards
    // the person who drew it.
    expect(edgeSeats(4).map((seat) => seat.edge)).toEqual(["top", "right", "bottom", "left"]);
    expect(edgeSeats(8).map((seat) => seat.edge)).toEqual([
      "top",
      "top",
      "right",
      "right",
      "bottom",
      "bottom",
      "left",
      "left",
    ]);
  });

  it("places a lone name in the middle of its edge, except along the bottom", () => {
    const four = edgeSeats(4);
    expect(four[0]?.along).toBe(50);
    expect(four[1]?.along).toBe(50);
    expect(four[3]?.along).toBe(50);
    // The bottom band is shared with the turn prompt, so that one seat is
    // pushed out of the middle rather than the prompt being moved somewhere
    // that costs the piles their size.
    expect(four[2]?.along).toBe(12);
  });

  it("never lets two names on one edge touch", () => {
    for (const count of everyTable) {
      const placed = edgeSeats(count);
      for (const edge of ["top", "right", "bottom", "left"] as const) {
        const here = placed.filter((seat) => seat.edge === edge);
        for (const [index, seat] of here.entries()) {
          const next = here[index + 1];
          if (next) expect(overlaps(span(seat.along, edge), span(next.along, edge))).toBe(false);
        }
      }
    }
  });

  it("never lets a name run off the end of its edge", () => {
    // The frame clips, so a name that overflowed would simply lose its last
    // few characters — on the one screen whose job is telling the table who is
    // sitting where.
    for (const count of everyTable) {
      for (const seat of edgeSeats(count)) {
        const [from, to] = span(seat.along, seat.edge);
        const length =
          seat.edge === "top" || seat.edge === "bottom"
            ? TABLE_DESIGN.width
            : TABLE_DESIGN.height;
        expect(from).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThanOrEqual(length);
      }
    }
  });

  it("keeps the side names out of the bands at the ends of their edge", () => {
    // A name on the left or right runs *along* the board, so a mark placed too
    // near either end pushes half a label into the top or bottom band — which
    // is how the right-hand name ended up under the view toggle the first time
    // this was laid out.
    for (const count of everyTable) {
      for (const seat of edgeSeats(count)) {
        if (seat.edge !== "left" && seat.edge !== "right") continue;
        const [from, to] = span(seat.along, seat.edge);
        expect(from).toBeGreaterThanOrEqual(BAND.top);
        expect(to).toBeLessThanOrEqual(TABLE_DESIGN.height - BAND.bottom);
      }
    }
  });

  it("keeps the top names out of the corners the furniture sits in", () => {
    // The room code holds one top corner and the view toggle the other. They
    // are up there because the middle of the board belongs to the piles and to
    // the peel that fans out of them.
    for (const count of everyTable) {
      for (const seat of edgeSeats(count)) {
        if (seat.edge !== "top") continue;
        const [from, to] = span(seat.along, "top");
        expect(from).toBeGreaterThanOrEqual(BAND.corner);
        expect(to).toBeLessThanOrEqual(TABLE_DESIGN.width - BAND.corner);
      }
    }
  });

  it("keeps every bottom name clear of the turn prompt beside it", () => {
    // The prompt and the bottom names share one band. That is the arrangement
    // the whole composition rests on — everywhere else for the prompt costs
    // the piles either width or height — so it gets an assertion rather than a
    // careful eye.
    const prompt: [number, number] = [
      (TABLE_DESIGN.width - PROMPT) / 2,
      (TABLE_DESIGN.width + PROMPT) / 2,
    ];
    for (const count of everyTable) {
      for (const seat of edgeSeats(count)) {
        if (seat.edge !== "bottom") continue;
        expect(overlaps(span(seat.along, "bottom"), prompt)).toBe(false);
      }
    }
  });

  it("answers for a table too small to be dealt, rather than throwing", () => {
    // A lobby is a room before it is a game, and the board draws the names it
    // has: one seat, no seats, whatever the room is holding.
    expect(edgeSeats(0)).toEqual([]);
    expect(edgeSeats(1)).toEqual([{ edge: "top", along: 50 }]);
    expect(edgeFor(0, 0)).toBe("top");
  });
});
