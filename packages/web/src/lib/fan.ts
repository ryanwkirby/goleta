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

/** The narrowest sliver where a rank and its suit are still unambiguously
 * readable — `10` at `text-sm` is the binding case, its right edge at 19.97px.
 * Past here the strip scrolls *between* seats instead. */
export const TIGHTEST = 22;

export const handWidth = (cards: number, sliver: number): number =>
  cards > 0 ? (cards - 1) * sliver + CARD : 0;

/** A hand of that many cards, or a chip. Two kinds rather than a number and a
 * flag: an eliminated seat is a different shape, and never wraps. */
export type SeatHand = number | "out";

/** `out` is the measured shared chip width, floored at `SEAT_OUT_MIN`. Defaulted
 * so a caller with nothing measured yet gets exactly what it got before. */
export const seatWidth = (hand: SeatHand, sliver: number, out = SEAT_OUT_MIN): number =>
  hand === "out"
    ? Math.max(SEAT_OUT_MIN, out)
    : Math.max(SEAT_MIN, handWidth(hand, sliver) + SEAT_PAD);

export const stripWidth = (
  hands: readonly SeatHand[],
  sliver: number,
  out = SEAT_OUT_MIN,
): number =>
  hands.reduce<number>((total, hand) => total + seatWidth(hand, sliver, out), 0) +
  SEAT_GAP * Math.max(0, hands.length - 1);

export interface Fan {
  /** Left edge to left edge: how much of a card its neighbour leaves showing. */
  sliver: number;
  rows: number[];
}

const tighten = (available: number, hands: readonly SeatHand[], out: number): number => {
  for (let sliver = LOOSEST; sliver > TIGHTEST; sliver--) {
    if (stripWidth(hands, sliver, out) <= available) return sliver;
  }
  return TIGHTEST;
};

const rowCapacity = (available: number, sliver: number): number => {
  const room = available - SEAT_PAD - CARD;
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
): Fan => {
  if (available <= 0) return { sliver: LOOSEST, rows: hands.map((hand) => rowsFor(hand, null)) };

  const sliver = tighten(available, hands, out);
  const perRow = rowCapacity(available, sliver);
  return { sliver, rows: hands.map((hand) => rowsFor(hand, perRow)) };
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
