import { describe, expect, it } from "vitest";

import {
  fanTable,
  handWidth,
  inRows,
  LOOSEST,
  seatWidth,
  stripWidth,
  TIGHTEST,
  type SeatHand,
} from "../src/lib/fan.ts";

/** A desktop strip inside `max-w-3xl`, and a phone one. */
const DESKTOP = 760;
const PHONE = 358;

/** The widest row any of these hands ends up using. */
const widestRow = (hands: number[], available: number): number => {
  const { sliver, rows } = fanTable(available, hands);
  return Math.max(
    ...hands.map((cards, seat) => seatWidth(Math.ceil(cards / (rows[seat] ?? 1)), sliver)),
  );
};

/** A hand of that many cards, standing in for the cards themselves. */
const hand = (count: number): number[] => Array.from({ length: count }, (_, at) => at);

describe("how far the table's cards overlap", () => {
  it("leaves a table that already fits exactly as it was", () => {
    const fan = fanTable(DESKTOP, [2, 2, 2]);
    expect(fan.sliver).toBe(LOOSEST);
    expect(fan.rows).toEqual([1, 1, 1]);
  });

  it("never spreads cards further apart than a card and its gap", () => {
    expect(fanTable(4000, [1, 1]).sliver).toBe(LOOSEST);
  });

  it("tightens exactly enough to fit the strip, and no more", () => {
    for (const [available, hands] of [
      [DESKTOP, [8, 8, 8]],
      [PHONE, [5, 5]],
    ] as [number, number[]][]) {
      const { sliver } = fanTable(available, hands);
      expect(sliver).toBeLessThan(LOOSEST);
      expect(sliver).toBeGreaterThan(TIGHTEST);
      expect(stripWidth(hands, sliver)).toBeLessThanOrEqual(available);
      // A notch looser would have overflowed — this is the loosest that fits.
      expect(stripWidth(hands, sliver + 1)).toBeGreaterThan(available);
    }
  });

  it("stops at the floor and lets the strip scroll rather than squash a rank", () => {
    const hands = [10, 10, 10, 10];
    const { sliver } = fanTable(PHONE, hands);
    expect(sliver).toBe(TIGHTEST);
    expect(stripWidth(hands, sliver)).toBeGreaterThan(PHONE);
  });

  // The limit the change is honest about: a full table on a phone bottoms out
  // at the floor and still doesn't fit across. What's left is scrolling between
  // seats — each one whole, and every hand readable without scrolling inside it.
  it("still overflows a phone at a full table, with every seat intact", () => {
    const hands = [4, 4, 4, 4];
    const fan = fanTable(PHONE, hands);
    expect(fan.sliver).toBe(TIGHTEST);
    expect(stripWidth(hands, fan.sliver)).toBeGreaterThan(PHONE);
    expect(fan.rows).toEqual([1, 1, 1, 1]);
    expect(seatWidth(4, fan.sliver)).toBeLessThanOrEqual(PHONE);
  });

  it("gives every seat the same sliver, whatever each of them is holding", () => {
    // One shared number by construction; this pins the shape of the answer, so
    // a per-seat sliver can't creep in without failing here.
    const fan = fanTable(PHONE, [1, 7, 20]);
    expect(typeof fan.sliver).toBe("number");
    expect(handWidth(7, fan.sliver) - handWidth(6, fan.sliver)).toBe(fan.sliver);
  });

  it("renders as it always did until the strip has been measured", () => {
    expect(fanTable(0, [8, 8, 8])).toEqual({ sliver: LOOSEST, rows: [1, 1, 1] });
  });
});

describe("when a hand wraps", () => {
  it("never lets a seat grow wider than the strip, at any hand size", () => {
    for (const available of [PHONE, 500, DESKTOP]) {
      for (let cards = 1; cards <= 46; cards++) {
        const hands = [cards, cards, cards];
        expect(widestRow(hands, available)).toBeLessThanOrEqual(available);
      }
    }
  });

  it("only wraps once tightening has bottomed out", () => {
    // Three hands of eight fan down to a sliver still above the floor, and the
    // whole table is on screen in one row each.
    const fan = fanTable(DESKTOP, [8, 8, 8]);
    expect(fan.sliver).toBeGreaterThan(TIGHTEST);
    expect(fan.rows).toEqual([1, 1, 1]);
  });

  it("keeps a ten-card hand in one fanned row rather than a squat block", () => {
    expect(fanTable(PHONE, [10, 10, 10, 10]).rows).toEqual([1, 1, 1, 1]);
  });

  it("wraps a hand too wide for one row even at the floor", () => {
    // Twenty cards at the floor is 458px of hand against ~334px of room.
    expect(fanTable(PHONE, [20, 20]).rows).toEqual([2, 2]);
  });

  it("adds rows as a hand grows towards the size of the deck", () => {
    const rows = (held: number): number => fanTable(PHONE, [held]).rows[0] ?? 0;
    expect(rows(30)).toBeGreaterThanOrEqual(2);
    expect(rows(46)).toBeGreaterThanOrEqual(3);
    // Monotone: a bigger hand never uses fewer rows than a smaller one.
    let last = 0;
    for (let cards = 1; cards <= 46; cards++) {
      const now = rows(cards);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it("gives an eliminated player's empty hand no rows at all", () => {
    expect(fanTable(PHONE, [0, 5]).rows[0]).toBe(0);
    expect(fanTable(PHONE, ["out", 5]).rows[0]).toBe(0);
  });
});

/**
 * A seat that has run out of cards collapses to a name chip and moves to the
 * end of the strip (#192). The part that is easy to miss is this one: the fan
 * works the strip's width out from card counts, and `seatWidth(0, …)` is
 * `SEAT_MIN` — a full 128px reserved for something no longer drawn as a seat.
 */
describe("a table with players who are out", () => {
  it("costs the strip less than a seat holding nothing did", () => {
    // The old shape: an out player entered the arithmetic as a hand of zero.
    expect(seatWidth("out", LOOSEST)).toBeLessThan(seatWidth(0, LOOSEST));
    // And less than any live seat, at any sliver — that is the whole point.
    for (const sliver of [LOOSEST, TIGHTEST, 30]) {
      expect(seatWidth("out", sliver)).toBeLessThan(seatWidth(1, sliver));
    }
  });

  it("does not change width as the fan tightens under it", () => {
    // A chip has no cards in it, so there is nothing for a sliver to squeeze.
    expect(seatWidth("out", LOOSEST)).toBe(seatWidth("out", TIGHTEST));
  });

  it("hands the room back to the hands that are still being read", () => {
    // Six seats, three of them out — the late-game table the issue is about.
    // Modelled as empty hands each out seat reserves `SEAT_MIN`, the survivors
    // are squeezed to the floor to pay for it, and the cards get harder to read
    // for the rest of the game. Modelled as chips they are drawn looser.
    const asEmptyHands = [5, 5, 5, 0, 0, 0];
    const asChips: SeatHand[] = [5, 5, 5, "out", "out", "out"];

    expect(stripWidth(asChips, LOOSEST)).toBeLessThan(stripWidth(asEmptyHands, LOOSEST));
    expect(fanTable(DESKTOP, asEmptyHands).sliver).toBe(TIGHTEST);
    expect(fanTable(DESKTOP, asChips).sliver).toBeGreaterThan(TIGHTEST);
  });

  it("still fits the strip it was fitted to, out seats and all", () => {
    for (const available of [PHONE, 500, DESKTOP]) {
      for (const hands of [
        ["out", 4] as SeatHand[],
        [4, "out", 4] as SeatHand[],
        ["out", "out", "out", 9] as SeatHand[],
        [3, 3, 3, "out", "out"] as SeatHand[],
      ]) {
        const { sliver } = fanTable(available, hands);
        if (sliver > TIGHTEST) expect(stripWidth(hands, sliver)).toBeLessThanOrEqual(available);
      }
    }
  });

  it("leaves a table with nobody out exactly as it was", () => {
    expect(fanTable(PHONE, [7, 7, 7])).toEqual(fanTable(PHONE, [7, 7, 7]));
    expect(seatWidth(7, LOOSEST)).toBe(handWidth(7, LOOSEST) + 24);
  });

  it("is nothing but chips once everybody else is out", () => {
    const fan = fanTable(PHONE, ["out", "out", "out"]);
    expect(fan.rows).toEqual([0, 0, 0]);
    expect(stripWidth(["out", "out", "out"], fan.sliver)).toBeLessThan(PHONE);
  });
});

describe("dealing a hand into rows", () => {
  it("balances them rather than filling the first row", () => {
    expect(inRows(hand(20), 2).map((row) => row.length)).toEqual([10, 10]);
    expect(inRows(hand(21), 2).map((row) => row.length)).toEqual([11, 10]);
    expect(inRows(hand(5), 3).map((row) => row.length)).toEqual([2, 2, 1]);
  });

  it("keeps hand order across the break, which is what the labels read in", () => {
    expect(inRows(hand(7), 3).flat()).toEqual(hand(7));
  });

  it("never returns an empty row, or more rows than there are cards", () => {
    for (let count = 0; count <= 8; count++) {
      for (let rows = 0; rows <= 5; rows++) {
        const out = inRows(hand(count), rows);
        expect(out.length).toBeLessThanOrEqual(Math.min(rows, count));
        for (const row of out) expect(row.length).toBeGreaterThan(0);
        expect(out.flat().length).toBe(rows > 0 ? count : 0);
      }
    }
  });
});
