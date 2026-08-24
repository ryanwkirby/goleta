import { describe, expect, it } from "vitest";

import { TABLE_DESIGN } from "../src/lib/fitScale.ts";
import {
  edgeAt,
  edgeSeats,
  nameRung,
  nearestSeat,
  pillHeight,
  seatPoint,
  TURN_FOR,
  type Edge,
  type EdgeSeat,
} from "../src/lib/tableEdges.ts";

/**
 * A table nobody has arranged: evenly round the circle, in the order people sat
 * down, which is what the server hands out until somebody drags a name (#320).
 * The same numbers `evenSpots` produces there.
 */
const sitting = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index / count);

/** The prompt is centred in the bottom band and the rung says how wide it may be
 * — two labels and the prompt come to the full width of the design, so widening a
 * name is paid for by the prompt (#320). */
const promptSpan = (count: number): [number, number] => {
  const { prompt } = nameRung(sitting(count));
  return [(TABLE_DESIGN.width - prompt) / 2, (TABLE_DESIGN.width + prompt) / 2];
};

const MIN_SEATS = 4;
const MAX_SEATS = 8;
const everyTable = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i);

/** The span a label covers along its own edge, at its widest — which is the
 * rung's cap, because the label truncates to it. */
const span = (along: number, edge: Edge, count: number): [number, number] => {
  const length = edge === "top" || edge === "bottom" ? TABLE_DESIGN.width : TABLE_DESIGN.height;
  const middle = (along / 100) * length;
  const { label } = nameRung(sitting(count));
  return [middle - label / 2, middle + label / 2];
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
    expect(edgeSeats(sitting(4)).map((seat) => seat.edge)).toEqual(["top", "right", "bottom", "left"]);
    expect(edgeSeats(sitting(8)).map((seat) => seat.edge)).toEqual([
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
      const walked = edgeSeats(sitting(count)).map(perimeter);
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
      const placed = edgeSeats(sitting(count));
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

  it("places a lone name in the middle of the span it has", () => {
    // Three of the edges have one span and a lone name centres in it. The bottom
    // has two, either side of the prompt, and the walk reaches it from the right —
    // so a table of four puts its bottom name in the right-hand flank rather than
    // in the middle of the prompt.
    const four = edgeSeats(sitting(4));
    expect(four.map((seat) => seat.edge)).toEqual(["top", "right", "bottom", "left"]);
    // The top's span is symmetric, so its lone name lands on the middle of the
    // board. The sides' is not — the bottom band is deeper than the top one,
    // because it shares with the prompt — so the middle of the span is a little
    // above the middle of the edge, which is where the name belongs.
    expect(four[0]?.along).toBeCloseTo(50, 6);
    expect(four[1]?.along).toBeGreaterThan(45);
    expect(four[1]?.along).toBeLessThan(50);
    expect(four[2]?.along).toBeGreaterThan(60);
    expect(four[3]?.along).toBeCloseTo(four[1]?.along ?? 0, 6);
  });

  it("never lets two names on one edge touch", () => {
    for (const count of everyTable) {
      const placed = edgeSeats(sitting(count));
      for (const edge of ["top", "right", "bottom", "left"] as const) {
        const here = placed.filter((seat) => seat.edge === edge);
        for (const [index, seat] of here.entries()) {
          const next = here[index + 1];
          if (next)
            expect(overlaps(span(seat.along, edge, count), span(next.along, edge, count))).toBe(
              false,
            );
        }
      }
    }
  });

  it("never lets a name run off the end of its edge", () => {
    // The frame clips, so a name that overflowed would lose its last few characters
    // on the one screen whose job is telling the table who is sitting where.
    for (const count of everyTable) {
      for (const seat of edgeSeats(sitting(count))) {
        const [from, to] = span(seat.along, seat.edge, count);
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
      for (const seat of edgeSeats(sitting(count))) {
        if (seat.edge !== "left" && seat.edge !== "right") continue;
        const [from, to] = span(seat.along, seat.edge, count);
        const { band } = nameRung(sitting(count));
        expect(from).toBeGreaterThanOrEqual(band.top);
        expect(to).toBeLessThanOrEqual(TABLE_DESIGN.height - band.bottom);
      }
    }
  });

  it("keeps the top names out of the corners the furniture sits in", () => {
    // The room code holds one top corner and the view toggle the other, because the
    // middle of the board belongs to the piles and the peel that fans out of them.
    for (const count of everyTable) {
      for (const seat of edgeSeats(sitting(count))) {
        if (seat.edge !== "top") continue;
        const [from, to] = span(seat.along, "top", count);
        const { band } = nameRung(sitting(count));
        expect(from).toBeGreaterThanOrEqual(band.corner);
        expect(to).toBeLessThanOrEqual(TABLE_DESIGN.width - band.corner);
      }
    }
  });

  it("keeps the bottom names off the prompt they share a band with", () => {
    // The prompt is centred in the bottom band and the names are pushed out past it
    // (#141). It is also the tightest fit on the board.
    for (const count of everyTable) {
      for (const seat of edgeSeats(sitting(count))) {
        if (seat.edge !== "bottom") continue;
        expect(overlaps(span(seat.along, "bottom", count), promptSpan(count))).toBe(false);
      }
    }
  });

  /**
   * The names are read from the far side of a table, so they are as big as the
   * ring has room for and no bigger (#320). The ladder is a property of the seat
   * count, and these are the constraints that decide which rung a count can take
   * — asked as arithmetic rather than as a table of expected sizes, so retuning a
   * rung cannot quietly break the thing the rung exists for.
   */
  it("is bigger than it was wherever the ring has room", () => {
    for (const count of [4, 5, 6]) expect(nameRung(sitting(count)).size).toBeGreaterThan(24);
  });

  it("steps back down where two names share a side edge", () => {
    // 560 less two bands, halved, is not a big label — and a name too small to read
    // is the failure this was fixing, arriving by another route. A full table pays
    // for its own crowding rather than making a table of four pay for it.
    for (const count of everyTable) {
      const sides = edgeSeats(sitting(count)).filter(
        (seat) => seat.edge === "left" || seat.edge === "right",
      );
      const crowded = ["left", "right"].some(
        (edge) => sides.filter((seat) => seat.edge === edge).length > 1,
      );
      expect(nameRung(sitting(count)).size > 24).toBe(!crowded);
    }
  });

  it("steps down for a table that has crowded itself onto one side", () => {
    // The half the seat count could never say (#320): six people, four of them
    // down the right-hand side. Two big labels do not fit there however few are
    // at the table, so the rung is the crowded one and the extra names spill
    // round the corner rather than piling up.
    const bunched = [0, 0.26, 0.3, 0.34, 0.38, 0.6];
    expect(nameRung(bunched).size).toBe(24);
    const placed = edgeSeats(bunched);
    expect(placed).toHaveLength(bunched.length);
    for (const [index, seat] of placed.entries()) {
      const next = placed[index + 1];
      if (!next || next.edge !== seat.edge) continue;
      expect(overlaps(span(seat.along, seat.edge, 8), span(next.along, seat.edge, 8))).toBe(false);
    }
  });

  it("spills round the corner rather than dropping anybody", () => {
    // Every seat gets a place, even asking for the impossible: all eight on one
    // edge. Order-preserving, so the ring still walks forwards.
    const stacked = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08];
    const placed = edgeSeats(stacked);
    expect(placed).toHaveLength(8);
    const order = placed.map((seat) => ["top", "right", "bottom", "left"].indexOf(seat.edge));
    for (const [index, at] of order.entries()) {
      const before = order[index - 1];
      if (before !== undefined) expect(at).toBeGreaterThanOrEqual(before);
    }
  });

  it("leaves a full table exactly where it was", () => {
    // Seven and eight get the colour and nothing else, so nothing about the board
    // they already had moves: same bands, same prompt, same label cap.
    const full = nameRung(sitting(8));
    expect(full).toEqual(nameRung(sitting(7)));
    expect(full.label).toBe(216);
    expect(full.prompt).toBe(512);
    expect(full.band).toEqual({ top: 48, bottom: 48, side: 56, corner: 120 });
    expect(full.across).toEqual({ top: 24, bottom: 36, left: 28, right: 28 });
  });

  it("pays for a bigger name out of the prompt and the bands, and says so", () => {
    const big = nameRung(sitting(4));
    const small = nameRung(sitting(8));
    // Both halves of the trade, stated: the prompt narrows and the bands deepen,
    // which is what the centre piles give up through `pileBox` and `fitScale`.
    expect(big.prompt).toBeLessThan(small.prompt);
    expect(big.band.top).toBeGreaterThan(small.band.top);
    expect(big.band.bottom).toBeGreaterThan(small.band.bottom);
    expect(big.band.side).toBeGreaterThan(small.band.side);
    // And the label has to fit the flank the narrower prompt leaves.
    const flank = (TABLE_DESIGN.width - big.prompt) / 2;
    expect(big.label).toBeLessThan(flank);
  });

  it("keeps every name's pill on the board and off the piles, at every rung", () => {
    /**
     * `across` is the centre line, so half the pill hangs either side of it. Two
     * things can go wrong: a pill wider than its `across` runs off the outside of
     * the board, and a pill deeper than its band reaches inwards over the piles.
     *
     * The inward check allows the `GUTTER` the piles already keep clear of the
     * bands (#159) — the small rung spends 8 of those 10 at the bottom, which is
     * exactly the board as it was and the reason that gutter is 10.
     */
    const GUTTER = 10;
    for (const count of everyTable) {
      const rung = nameRung(sitting(count));
      const { band, across } = rung;
      const half = pillHeight(rung) / 2;
      expect(across.top - half).toBeGreaterThanOrEqual(0);
      expect(across.top + half).toBeLessThanOrEqual(band.top + GUTTER);
      expect(across.bottom - half).toBeGreaterThanOrEqual(0);
      expect(across.bottom + half).toBeLessThanOrEqual(band.bottom + GUTTER);
      for (const edge of ["left", "right"] as const) {
        expect(across[edge] - half).toBeGreaterThanOrEqual(0);
        expect(across[edge] + half).toBeLessThanOrEqual(band.side + GUTTER);
      }
    }
  });

  it("answers for a table too small to be dealt, rather than throwing", () => {
    // A lobby is a room before it is a game, and the board draws the names it has.
    expect(edgeSeats(sitting(0))).toEqual([]);
    expect(edgeSeats(sitting(1))).toEqual([
      { edge: "top", along: 50, across: nameRung(sitting(1)).across.top },
    ]);
    // The ring starts at the top-left corner, so the first quarter is the top edge.
    expect(edgeAt(0)).toBe("top");
    expect(edgeAt(0.24)).toBe("top");
    expect(edgeAt(0.25)).toBe("right");
    expect(edgeAt(0.5)).toBe("bottom");
    expect(edgeAt(0.75)).toBe("left");
    expect(edgeAt(0.999)).toBe("left");
  });
});

const nearest = (point: { x: number; y: number }, count: number): number =>
  nearestSeat(point, sitting(count), TABLE_DESIGN);

/**
 * Dropping a dragged name (#201). Position on that board *is* seat order, so
 * "which place did it land in" is "whose spot did it come down on".
 */
describe("the seat a point on the board is nearest", () => {
  it("answers with the seat sitting there", () => {
    // Four seats walk clockwise from the top, one to an edge.
    const spots = edgeSeats(sitting(4));
    for (const [index, spot] of spots.entries()) {
      expect(nearest(seatPoint(spot, TABLE_DESIGN), 4)).toBe(index);
    }
  });

  it("reads an edge rather than a point", () => {
    const spots = edgeSeats(sitting(4));
    const left = spots.findIndex((spot) => spot.edge === "left");
    // Well inside the left band and a long way off the name's own centre. A
    // *corner* is genuinely ambiguous and answers with whichever seat is nearer,
    // which is the honest reading of a drop into a corner.
    expect(nearest({ x: 4, y: TABLE_DESIGN.height / 2 - 90 }, 4)).toBe(left);
  });

  it("never answers with nothing, however far outside the drop is", () => {
    // Dropping off the board is dropping on the nearest edge — the same answer
    // `moveSeat` gives for a hop off either end.
    expect(nearest({ x: -900, y: -900 }, 4)).toBeGreaterThanOrEqual(0);
    expect(nearest({ x: 9000, y: 9000 }, 6)).toBeLessThan(6);
  });
});
