/**
 * Fitting one fixed design into whatever screen it has been given.
 *
 * The shared table screen (#14) runs at anything from a 10" tablet at arm's
 * length to a television across a lounge, and it has to be readable at both
 * without a stack of breakpoints. So it is laid out once, at a nominal size, and
 * then scaled — which means the proportions are decided in one place and every
 * screen gets the same picture, larger or smaller.
 *
 * The alternative, sizing each piece in viewport units, gets the type right and
 * the *relationships* wrong: a card that is 12vh tall next to a name that is
 * 3vw wide recomposes itself at every aspect ratio, and a screen propped in the
 * middle of a table is exactly where that shows.
 *
 * Pure arithmetic, no DOM: what the board does at any size is a test rather
 * than a squint at a television.
 */

export interface Box {
  width: number;
  height: number;
}

/** A spot in the design box, in design pixels from its top-left corner. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The design the table screen is drawn at. Wide, because #14 assumes landscape
 * — a device propped facing a table is turned the long way, the same as a
 * television is.
 */
export const TABLE_DESIGN: Box = { width: 1000, height: 560 };

/**
 * How much to scale `design` by so it fits inside `box` whole.
 *
 * The smaller of the two ratios, so nothing is ever cropped: this screen has no
 * scrolling and nobody is standing at it to scroll anyway. It is allowed to
 * scale *up* without limit — a television is the case this exists for, and
 * capping it would leave the board marooned in the middle of one.
 *
 * Before anything has been measured there is nothing to fit to, so it renders
 * at its design size and the observer corrects it in the same frame.
 */
export const fitScale = (box: Box, design: Box = TABLE_DESIGN): number => {
  if (box.width <= 0 || box.height <= 0) return 1;
  if (design.width <= 0 || design.height <= 0) return 1;
  return Math.min(box.width / design.width, box.height / design.height);
};

/** The same box, turned a quarter. */
export const turned = (box: Box): Box => ({ width: box.height, height: box.width });

/**
 * Whether to lay the board across the short way and turn it a quarter (#141).
 *
 * Asked as arithmetic and nothing else: turning the board is worth it exactly
 * when the turned box fits more of it than the box as given. For a wide design
 * that is the same as asking whether the screen is upright, but it is asked
 * this way because it is the actual question, it holds if `TABLE_DESIGN` ever
 * changes shape, and it needs no user agent, no orientation lock and no idea of
 * what a phone is.
 *
 * The case it exists for is a phone standing in for a spare tablet. A shared
 * screen is a device lying flat with people sitting round it, so which way up
 * *it* is means nothing — but which way up it is held decides how much of the
 * screen the browser keeps for itself, and on a phone that is the difference
 * between a board you can read across a table and one you can't:
 *
 * | held      | viewport   | board |
 * | --------- | ---------- | ----- |
 * | landscape | ~734×320   | ×0.57 |
 * | upright   | ~393×659   | ×0.39 |
 * | upright, turned a quarter | | ×0.66 |
 *
 * Nothing here turns anybody's phone — see `RotatePanel` for why no page can.
 * `TableRotateNudge` asks, and this decides what to do with the answer.
 */
export const shouldTurn = (box: Box, design: Box = TABLE_DESIGN): boolean =>
  fitScale(turned(box), design) > fitScale(box, design);
