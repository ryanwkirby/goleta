/**
 * Fanning the seat strip: one overlap for the whole table, rows as the valve.
 *
 * Hands are face up because reading them *is* the game, and that only pays off
 * if they can be seen. Laid flat, fourteen cards is a seat 615px wide, so a
 * phone made you scroll inside a single hand — every late game, since hands grow
 * here (#59).
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
/** A seat's `px-3`, and the `min-w-32` it keeps however few cards it holds. */
const SEAT_PAD = 24;
const SEAT_MIN = 128;

/** A collapsed seat's `min-w-20` (#192). Easy to miss: `seatWidth(0, sliver)`
 * returns `SEAT_MIN`, so without this the fan reserves a full seat for something
 * no longer drawn as one and tightens everybody else to pay for it. */
const SEAT_OUT_MIN = 80;
/** `gap-2`, between one seat and the next. */
const SEAT_GAP = 8;

/** No overlap at all, so a table that already fits is drawn as it always was. */
export const LOOSEST = CARD + GAP;

/** The narrowest sliver where a rank and its suit are still unambiguously
 * readable — `10` at `text-sm` is the binding case, its right edge at 19.97px.
 * Past here the strip scrolls *between* seats instead. */
export const TIGHTEST = 22;

/** How wide `cards` sit in one row at this sliver, the last one showing whole. */
export const handWidth = (cards: number, sliver: number): number =>
  cards > 0 ? (cards - 1) * sliver + CARD : 0;

/** A hand of that many cards, or a chip. Two kinds rather than a number and a
 * flag: an eliminated seat is a different shape, and never wraps. */
export type SeatHand = number | "out";

/** The seat around a hand: its padding, and the width it never goes under. */
export const seatWidth = (hand: SeatHand, sliver: number): number =>
  hand === "out" ? SEAT_OUT_MIN : Math.max(SEAT_MIN, handWidth(hand, sliver) + SEAT_PAD);

/** Every seat side by side, which is what has to fit the strip. */
export const stripWidth = (hands: readonly SeatHand[], sliver: number): number =>
  hands.reduce<number>((total, hand) => total + seatWidth(hand, sliver), 0) +
  SEAT_GAP * Math.max(0, hands.length - 1);

export interface Fan {
  /** Left edge to left edge: how much of a card its neighbour leaves showing. */
  sliver: number;
  rows: number[];
}

/** The loosest sliver that fits the whole strip, or the floor if none does. */
const tighten = (available: number, hands: readonly SeatHand[]): number => {
  for (let sliver = LOOSEST; sliver > TIGHTEST; sliver--) {
    if (stripWidth(hands, sliver) <= available) return sliver;
  }
  return TIGHTEST;
};

/** The most cards one row can hold without the seat outgrowing the strip. */
const rowCapacity = (available: number, sliver: number): number => {
  const room = available - SEAT_PAD - CARD;
  return room > 0 ? Math.floor(room / sliver) + 1 : 1;
};

/** A collapsed seat takes none, at every width — which is also what `null` means
 * here, for a strip that has not been measured yet. */
const rowsFor = (hand: SeatHand, perRow: number | null): number => {
  if (hand === "out" || hand === 0) return 0;
  return perRow === null ? 1 : Math.ceil(hand / perRow);
};

/**
 * Tighten first, wrap second, and only as far as each is needed: a ten-card hand
 * stays one fanned row rather than a squat block, and a table that fits at
 * today's spacing is left alone. Before the strip has been measured it renders
 * the way it always did and the observer corrects it in the same frame.
 */
export const fanTable = (available: number, hands: readonly SeatHand[]): Fan => {
  if (available <= 0) return { sliver: LOOSEST, rows: hands.map((hand) => rowsFor(hand, null)) };

  const sliver = tighten(available, hands);
  const perRow = rowCapacity(available, sliver);
  return { sliver, rows: hands.map((hand) => rowsFor(hand, perRow)) };
};

/** Tighten first, wrap second, and only as far as each is needed. Before the
 * strip has been measured it renders the way it always did, and the observer
 * corrects it in the same frame. */
export type Row<T> = [T, ...T[]];

/**
 * `items` dealt into that many rows, in order, as evenly as they divide — twenty
 * across two rows is ten and ten, never sixteen and four. Never returns an empty
 * row, and never more rows than there are items.
 */
export const inRows = <T>(items: readonly T[], rows: number): Row<T>[] => {
  const out: Row<T>[] = [];
  let taken = 0;
  for (let left = Math.min(rows, items.length); left > 0; left--) {
    /** In order and as evenly as they divide — twenty across two rows is ten and
 * ten, never sixteen and four. Never an empty row. */
    const size = Math.ceil((items.length - taken) / left);
    out.push(items.slice(taken, taken + size) as Row<T>);
    taken += size;
  }
  return out;
};
