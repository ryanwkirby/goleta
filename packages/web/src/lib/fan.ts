import { CARD_HEIGHT_PX, readableSliver } from "./cardShape.ts";
import type { Box } from "./fitScale.ts";

/**
 * Fanning the seat strip: one overlap for the whole table, rows as the valve.
 * Laid flat, fourteen cards is a seat 615px wide, so a phone made you scroll
 * inside a single hand (#59).
 *
 * **The sliver is shared by the entire strip**, so the spacing never says how
 * many cards somebody holds, and **rows only come out once tightening has
 * bottomed out**. The floor outranks fitting more on screen: a sliver that
 * leaves `10♦` and `J♦` hard to tell apart breaks the Sunny Rule quietly.
 */

/** `w-10` on a `sm` card — the same 40px `CARD_WIDTH_PX` records. */
const CARD = 40;
/** `gap-1`, which is all that sat between two cards before any of this. */
const GAP = 4;
/** A seat's `px-3`. */
const SEAT_PAD = 24;
/** The `min-w-32` a seat keeps however few cards it holds. */
const SEAT_MIN = 128;

/** A collapsed seat's `min-w-20` (#192). Easy to miss: `seatWidth(0, sliver)`
 * returns `SEAT_MIN`, so without this the fan reserves a full seat for something
 * no longer drawn as one and tightens everybody else to pay for it.
 *
 * **A floor rather than the answer** (#334). Every out seat is now drawn at one
 * width — as small as the longest already-out name allows — and that number is
 * measured on the component side and handed in, the way `available` already is.
 * Left flat here, the strip's arithmetic would be wrong about how much room is
 * left for the hands that still matter, which is the whole reason an out seat
 * collapses at all. */
export const SEAT_OUT_MIN = 80;
/** `gap-2`, between one seat and the next. */
const SEAT_GAP = 8;

export const LOOSEST = CARD + GAP;

/**
 * The chip's own furniture, down the page rather than across it, in the same
 * rem-written-out pixels as the widths above: the strip's `p-1` top and bottom,
 * a seat's `py-2`, the name row, the `mt-1.5` over the cards and the `gap-1`
 * between two rows of them.
 *
 * `NAME_ROW` is measured rather than derived, the way `pillHeight`'s is: the row
 * is `items-baseline` with a `font-mono` count in it, and comes out a pixel over
 * the `text-sm` line. A strip of one-row hands measures 107 and this says 107.
 */
const STRIP_PAD = 8;
const SEAT_PAD_Y = 16;
const NAME_ROW = 21;
const NAME_GAP = 6;
const ROW_GAP = 4;

/** How tall the strip stands when its deepest hand takes that many rows. */
export const stripHeight = (rows: number, scale = 1): number => {
  const deep = Math.max(1, rows);
  return (
    (STRIP_PAD + SEAT_PAD_Y + NAME_ROW + NAME_GAP + deep * CARD_HEIGHT_PX.sm + (deep - 1) * ROW_GAP) *
    scale
  );
};

/** The narrowest sliver where a rank and its suit are still unambiguously
 * readable — `10` at `text-sm` is the binding case, its right edge at 19.97px.
 * Past here the strip scrolls *between* seats instead. */
export const TIGHTEST = 22;

/**
 * The same question asked of large print's face, which is not the same face
 * (#323): one rank about twice the ink, drawn from `LARGE_CARD_SHAPE`'s
 * fractions rather than from a `text-…` class. Scaling 22 would leave a sliver
 * that cuts a digit in half, which is the one thing this floor exists to stop.
 *
 * It comes out around three quarters of a card rather than half of one, so a
 * large-print strip barely overlaps and scrolls sooner. That is the trade #323
 * names: rows and scrolling between seats are the release valve (#59), and a
 * hand you cannot read is a play you cannot spot.
 */
const tightestAt = (scale: number, large: boolean): number =>
  large
    ? readableSliver(CARD_HEIGHT_PX.sm * scale, true)
    : Math.round(TIGHTEST * scale);

/**
 * Every number above is a rem written out in pixels — `w-10`, `gap-1`, `px-3`,
 * `min-w-32`, `gap-2` — and `TIGHTEST` is a measurement off `text-sm`. So in
 * large print (#323) the whole set moves by the one scale the root font size
 * moved by, and each function below takes it.
 *
 * The **legibility** floor scales with the card, because a bigger card tightened
 * to the same 22px sliver buys nothing. There is no tap floor in this file at
 * all: nothing in the seat strip is a control. Default 1, so a caller that has
 * not been told is exactly the strip this was before.
 */
export const handWidth = (cards: number, sliver: number, scale = 1): number =>
  cards > 0 ? (cards - 1) * sliver + CARD * scale : 0;

/** A hand of that many cards, or a chip. Two kinds rather than a number and a
 * flag: an eliminated seat is a different shape, and never wraps. */
export type SeatHand = number | "out";

/** `out` is the measured shared chip width, floored at `SEAT_OUT_MIN`. Defaulted
 * so a caller with nothing measured yet gets exactly what it got before. */
export const seatWidth = (
  hand: SeatHand,
  sliver: number,
  out = SEAT_OUT_MIN,
  scale = 1,
): number =>
  hand === "out"
    ? Math.max(SEAT_OUT_MIN * scale, out)
    : Math.max(SEAT_MIN * scale, handWidth(hand, sliver, scale) + SEAT_PAD * scale);

export const stripWidth = (
  hands: readonly SeatHand[],
  sliver: number,
  out = SEAT_OUT_MIN,
  scale = 1,
): number =>
  hands.reduce<number>((total, hand) => total + seatWidth(hand, sliver, out, scale), 0) +
  SEAT_GAP * scale * Math.max(0, hands.length - 1);

export interface Fan {
  /** Left edge to left edge: how much of a card its neighbour leaves showing. */
  sliver: number;
  rows: number[];
}

const tighten = (
  available: number,
  hands: readonly SeatHand[],
  out: number,
  scale: number,
  large: boolean,
): number => {
  const floor = tightestAt(scale, large);
  for (let sliver = Math.round(LOOSEST * scale); sliver > floor; sliver--) {
    if (stripWidth(hands, sliver, out, scale) <= available) return sliver;
  }
  return floor;
};

const rowCapacity = (available: number, sliver: number, scale: number): number => {
  const room = available - (SEAT_PAD + CARD) * scale;
  return room > 0 ? Math.floor(room / sliver) + 1 : 1;
};

/** A collapsed seat takes none at every width — which is also what `null` means
 * here, for a strip that has not been measured yet. */
const rowsFor = (hand: SeatHand, perRow: number | null): number => {
  if (hand === "out" || hand === 0) return 0;
  return perRow === null ? 1 : Math.ceil(hand / perRow);
};

/**
 * Tighten first, wrap second, and only as far as each is needed. Before the strip
 * has been measured it renders the way it always did, and the observer corrects
 * it in the same frame.
 */
export const fanTable = (
  available: number,
  hands: readonly SeatHand[],
  /** What one out seat's chip actually measures (#334). */
  out = SEAT_OUT_MIN,
  /** How much bigger this device draws everything (#323). */
  scale = 1,
  /** Whether the cards are drawn with large print's face, which is what decides
   * the floor. It travels with `scale` and is spelled out beside it because the
   * two are different questions: one is how big a card is, the other is where
   * the ink on it sits. */
  large = false,
): Fan => {
  if (available <= 0) {
    return {
      sliver: Math.round(LOOSEST * scale),
      rows: hands.map((hand) => rowsFor(hand, null)),
    };
  }

  const sliver = tighten(available, hands, out, scale, large);
  const perRow = rowCapacity(available, sliver, scale);
  return { sliver, rows: hands.map((hand) => rowsFor(hand, perRow)) };
};

/**
 * The strip drawn as big as a **fixed box** will take it (#439).
 *
 * The seat strip is a phone's: `sm` cards, `text-sm` names, a row that scrolls
 * when it will not fit (#59). That is right on the device it was written for and
 * wrong in the middle of a table, where nobody is going to scroll it and it is
 * read from the far side of the room — the gap #320 closed for the edge names.
 *
 * So a caller that knows exactly what room the strip has may ask for the largest
 * scale that fits it. One number takes cards, names, counts, padding and chips
 * together, which is what keeps the strip the strip: this is `ScaledPiles`'s
 * shape and #159's rule, a piece asking for the room it wants rather than
 * painting outside the box the layout gave it.
 *
 * Three things it is careful about.
 *
 * **It never goes below 1.** A strip that will not fit its box is the strip
 * that exists today and it scrolls, which is #59's accepted cost; shrinking the
 * cards to fit a full table would break the rule that pays for it, which is that
 * a hand you cannot read is a play you cannot spot.
 *
 * **The answer is quantised.** Hands grow and shrink on nearly every turn, and a
 * scale computed to the pixel would resize the whole table each time one did.
 *
 * **It buys nothing at a crowded table, and that is honest rather than a bug.**
 * Seven seats at their `min-w-32` floor come to 944 of the 960 a board has, so
 * the width binds at 1 and the strip is exactly what it was. What it is for is
 * a table that has thinned out — six seats out and one holding four cards is 796
 * wide, and takes the whole of the height it is given.
 */
export interface StripFit {
  /** What to scale the strip by. At least 1. */
  scale: number;
  /** The width the strip lays out in, in its own pixels, before that scale. */
  available: number;
  /** What it measures across at that width, before the scale. Larger than
   * `available` only in the overflowing case the scale is 1 for. */
  width: number;
  /** And down the page, before the scale. */
  height: number;
  fan: Fan;
}

/** Tenths, from twice the size down to the size it already is. Coarse on
 * purpose: see "quantised" above. */
const STRIP_STEPS = Array.from({ length: 11 }, (_, step) => (20 - step) / 10);

export const fitStrip = (
  box: Box,
  hands: readonly SeatHand[],
  out = SEAT_OUT_MIN,
  scale = 1,
  large = false,
): StripFit => {
  const at = (k: number): StripFit => {
    const available = box.width / k;
    const fan = fanTable(available, hands, out, scale, large);
    return {
      scale: k,
      available,
      width: stripWidth(hands, fan.sliver, out, scale),
      height: stripHeight(Math.max(1, ...fan.rows), scale),
      fan,
    };
  };

  if (box.width > 0 && box.height > 0) {
    for (const step of STRIP_STEPS) {
      const fit = at(step);
      if (fit.width <= fit.available && fit.height * step <= box.height) return fit;
    }
  }
  // Nothing fits: the strip it already was, overflowing and scrolling.
  return at(1);
};

/** Never empty, which is a promise `inRows` keeps. */
export type Row<T> = [T, ...T[]];

/** `items` dealt into that many rows, in order and as evenly as they divide —
 * twenty across two rows is ten and ten, never sixteen and four. */
export const inRows = <T>(items: readonly T[], rows: number): Row<T>[] => {
  const out: Row<T>[] = [];
  let taken = 0;
  for (let left = Math.min(rows, items.length); left > 0; left--) {
    // At least one item is left per row still to come, which is what the cast
    // stands on.
    const size = Math.ceil((items.length - taken) / left);
    out.push(items.slice(taken, taken + size) as Row<T>);
    taken += size;
  }
  return out;
};
