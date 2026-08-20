import { describe, expect, it } from "vitest";

import { TABLE_DESIGN } from "../src/lib/fitScale.ts";
import {
  BAND,
  edgeFor,
  edgeSeats,
  LABEL,
  seatPoint,
  TURN_FOR,
  type Edge,
  type EdgeSeat,
} from "../src/lib/tableEdges.ts";

/** The one measurement `TableScreen` owns: `max-w-128` on the prompt, centred.
 * Kept in step by hand, and worth a test — two labels and the prompt come to the
 * full width of the design, so widening a name has to be paid for by the prompt. */
const PROMPT = 512;
const promptSpan: [number, number] = [
  (TABLE_DESIGN.width - PROMPT) / 2,
  (TABLE_DESIGN.width + PROMPT) / 2,
];

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

/** How far round the edge of the design a seat sits, measured clockwise from the
 * top-left corner. Unrolling the perimeter into one number is what makes the
 * property a comparison rather than a table of expected values. */
const { width: W, height: H } = TABLE_DESIGN;
const perimeter = (seat: EdgeSeat): number => {
  const along = seat.along / 100;
  switch (seat.edge) {
    case "top":
      return along * W;
    case "right":
      return W + along * H;
    case "bottom":
      return W + H + (1 - along) * W;
    case "left":
      return 2 * W + H + (1 - along) * H;
  }
};

describe("naming the seats round a shared table screen", () => {
  it("reads each name from outside the edge it is on", () => {
    // 180° out on all four sides until #141: the top name was drawn upright, which
    // is what somebody at the *bottom* of the table sees.
    expect(TURN_FOR.bottom).toBe(0);
    expect(TURN_FOR.top).toBe(180);
    // A quarter turn each, in the direction you would walk round the table.
    expect(TURN_FOR.left).toBe(90);
    expect(TURN_FOR.right).toBe(-90);
  });

  it("walks the seats round the table in turn order", () => {
    // Seat order is turn order, so play sweeps round the board rather than hopping
    // across it — which is what makes a drawn card fly towards the person who drew it.
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

  it("walks clockwise round the perimeter, all the way from seat 0 back to the start", () => {
    // `along` runs left-to-right and top-to-bottom, which is clockwise on the top and
    // right edges and anticlockwise on the other two — so handing pairs out in raw
    // `along` order swapped seats 3 and 4 at a table of six (#186). Asked as
    // distance round the edge, so it stays true if the spreads are retuned.
    for (const count of everyTable) {
      const walked = edgeSeats(count).map(perimeter);
      for (const [index, at] of walked.entries()) {
        const previous = walked[index - 1];
        if (previous !== undefined) expect(at).toBeGreaterThan(previous);
      }
    }
  });

  it("throws a drawn card at the seat that drew it, at every table size", () => {
    // The half that isn't cosmetic: since #164 the flight aims at `seatPoint`, so a
    // name in the wrong place is a card thrown at the wrong player.
    for (const count of everyTable) {
      const placed = edgeSeats(count);
      for (const edge of ["top", "right", "bottom", "left"] as const) {
        const here = placed.filter((seat) => seat.edge === edge);
        if (here.length < 2) continue;
        const [first, second] = here.map((seat) => seatPoint(seat, TABLE_DESIGN));
        if (!first || !second) continue;
        // Clockwise: rightwards along the top, downwards on the right, leftwards
        // along the bottom, upwards on the left.
        if (edge === "top") expect(second.x).toBeGreaterThan(first.x);
        if (edge === "bottom") expect(second.x).toBeLessThan(first.x);
        if (edge === "right") expect(second.y).toBeGreaterThan(first.y);
        if (edge === "left") expect(second.y).toBeLessThan(first.y);
      }
    }
  });

  it("places a lone name in the middle of its edge, except along the top and bottom", () => {
    const four = edgeSeats(4);
    expect(four[0]?.along).toBe(24);
    expect(four[1]?.along).toBe(50);
    expect(four[2]?.along).toBe(12);
    expect(four[3]?.along).toBe(50);
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
    // The frame clips, so a name that overflowed would lose its last few characters
    // on the one screen whose job is telling the table who is sitting where.
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
    // A name on the left or right runs *along* the board, so a mark too near either
    // end pushes half a label into the top or bottom band.
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
    // The room code holds one top corner and the view toggle the other, because the
    // middle of the board belongs to the piles and the peel that fans out of them.
    for (const count of everyTable) {
      for (const seat of edgeSeats(count)) {
        if (seat.edge !== "top") continue;
        const [from, to] = span(seat.along, "top");
        expect(from).toBeGreaterThanOrEqual(BAND.corner);
        expect(to).toBeLessThanOrEqual(TABLE_DESIGN.width - BAND.corner);
      }
    }
  });

  it("keeps the bottom names off the prompt they share a band with", () => {
    // The prompt is centred in the bottom band and the names are pushed out past it
    // (#141). It is also the tightest fit on the board.
    for (const count of everyTable) {
      for (const seat of edgeSeats(count)) {
        if (seat.edge !== "bottom") continue;
        expect(overlaps(span(seat.along, "bottom"), promptSpan)).toBe(false);
      }
    }
  });

  it("answers for a table too small to be dealt, rather than throwing", () => {
    // A lobby is a room before it is a game, and the board draws the names it has.
    expect(edgeSeats(0)).toEqual([]);
    expect(edgeSeats(1)).toEqual([{ edge: "top", along: 24 }]);
    expect(edgeFor(0, 0)).toBe("top");
  });
});
