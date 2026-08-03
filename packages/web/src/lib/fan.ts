/**
 * Fanning the seat strip: one overlap for the whole table, rows as the valve.
 *
 * Every hand is face up because reading them *is* the game — working out whether
 * somebody had a play they didn't make is the other half of the Sunny Rule, and
 * the app will never mark that up for you. It only pays off if the hands can
 * actually be seen. Laid flat at a card and a gap apiece, fourteen cards is a
 * seat 615px wide, so a phone showed you one player at a time and, past a
 * certain size, made you scroll *inside* a single hand to see all of it. Hands
 * grow here — drawing is the reward — so that was every late game, not an edge
 * case (#59).
 *
 * So the cards overlap, each leaving the one before it a sliver: its top-left
 * corner, rank over glyph, which is where the face already puts them. Two
 * numbers decide the whole layout, and there are deliberately no others:
 *
 *   - **The sliver is shared by the entire strip.** It's the tightest spacing
 *     that lets every seat fit across the strip at once, handed to everybody, so
 *     a hand of three reads exactly like a hand of twenty and the spacing itself
 *     never tells you how many cards somebody is holding.
 *   - **Rows only come out once tightening has bottomed out.** A hand that still
 *     can't fit the strip's width at the floor wraps into balanced rows until it
 *     does. That's what makes "no hand ever needs scrolling" true at any size a
 *     hand can reach — and it can reach most of the deck.
 *
 * The floor outranks fitting more on screen. A sliver that leaves `10♦` and `J♦`
 * hard to tell apart would break the Sunny Rule quietly, and the answer to a
 * corner you can't read is a wider floor, never an affordance — nothing about
 * somebody else's cards is allowed to become interactive.
 *
 * Pure arithmetic, no DOM: the widths arrive as numbers, so what the table does
 * at any size is a test rather than a squint at a phone.
 */

/** `w-10` on a `sm` card — the same 40px `CARD_WIDTH_PX` records. */
const CARD = 40;
/** `gap-1`, which is all that sat between two cards before any of this. */
const GAP = 4;
/** A seat's `px-3`, and the `min-w-32` it keeps however few cards it holds. */
const SEAT_PAD = 24;
const SEAT_MIN = 128;
/** `gap-2`, between one seat and the next. */
const SEAT_GAP = 8;

/**
 * No overlap at all: a whole card plus the gap. Nothing is ever looser than
 * this, so a table that already fits is drawn exactly as it always was.
 */
export const LOOSEST = CARD + GAP;

/**
 * The narrowest sliver where a rank and its suit are still unambiguously
 * readable. `10` at `text-sm` sitting behind the card's own `p-1` is the binding
 * case — everything else is one glyph — and it wants a shade over half a card.
 * Past here the strip scrolls instead; the scrolling that remains is *between*
 * seats, never inside one.
 */
export const TIGHTEST = 22;

/** How wide `cards` sit in one row at this sliver, the last one showing whole. */
export const handWidth = (cards: number, sliver: number): number =>
  cards > 0 ? (cards - 1) * sliver + CARD : 0;

/** The same, as the seat around it: its padding, and the width it never goes under. */
export const seatWidth = (cards: number, sliver: number): number =>
  Math.max(SEAT_MIN, handWidth(cards, sliver) + SEAT_PAD);

/** Every seat side by side, which is what has to fit the strip. */
export const stripWidth = (hands: readonly number[], sliver: number): number =>
  hands.reduce((total, cards) => total + seatWidth(cards, sliver), 0) +
  SEAT_GAP * Math.max(0, hands.length - 1);

export interface Fan {
  /** Left edge to left edge: how much of a card its neighbour leaves showing. */
  sliver: number;
  /** How many rows each hand takes, in the order the hands came in. */
  rows: number[];
}

/** The loosest sliver that fits the whole strip, or the floor if none does. */
const tighten = (available: number, hands: readonly number[]): number => {
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

/**
 * How to lay every hand on the table out, given the width the strip has to
 * spend and how many cards each seat is holding.
 *
 * Tighten first, wrap second, and only as far as each is needed: a ten-card hand
 * stays one fanned row rather than becoming a squat block, and a table that fits
 * at today's spacing is left alone.
 *
 * Before the strip has been measured there is nothing to fit anything to, so it
 * renders the way it always did and the observer corrects it in the same frame.
 */
export const fanTable = (available: number, hands: readonly number[]): Fan => {
  if (available <= 0) return { sliver: LOOSEST, rows: hands.map((cards) => (cards > 0 ? 1 : 0)) };

  const sliver = tighten(available, hands);
  const perRow = rowCapacity(available, sliver);
  return { sliver, rows: hands.map((cards) => Math.ceil(cards / perRow)) };
};

/** A row of a fanned hand. Never empty, which is a promise `inRows` keeps. */
export type Row<T> = [T, ...T[]];

/**
 * `items` dealt into that many rows, in order, as evenly as they divide — twenty
 * across two rows is ten and ten, never sixteen and four. Order is preserved
 * across the break, which is what keeps a hand's labels in hand order however
 * far it has been wrapped.
 *
 * Never returns an empty row, and never more rows than there are items.
 */
export const inRows = <T>(items: readonly T[], rows: number): Row<T>[] => {
  const out: Row<T>[] = [];
  let taken = 0;
  for (let left = Math.min(rows, items.length); left > 0; left--) {
    // At least one item is left over per row still to come, so every slice
    // taken here has something in it — which is what the cast is standing on.
    const size = Math.ceil((items.length - taken) / left);
    out.push(items.slice(taken, taken + size) as Row<T>);
    taken += size;
  }
  return out;
};
