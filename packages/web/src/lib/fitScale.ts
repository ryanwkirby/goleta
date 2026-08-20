/**
 * Fitting one fixed design into whatever screen it has been given.
 *
 * The shared table screen (#14) runs at anything from a tablet at arm's length
 * to a television across a lounge, so it is laid out once at a nominal size and
 * scaled. Sizing each piece in viewport units instead gets the type right and
 * the *relationships* wrong — a board that recomposes itself at every aspect
 * ratio is exactly what a screen propped at a table shows up.
 *
 * Pure arithmetic, no DOM: what the board does at any size is a test.
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

/** Wide, because #14 assumes landscape: a device propped facing a table is
 * turned the long way, the same as a television. */
export const TABLE_DESIGN: Box = { width: 1000, height: 560 };

/**
 * The smaller of the two ratios, so nothing is ever cropped — this screen has no
 * scrolling and nobody is standing at it to scroll anyway. Allowed to scale *up*
 * without limit, since a television is the case it exists for. Before anything
 * is measured it renders at design size and the observer corrects it.
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
 * Asked as arithmetic — does the turned box fit more of the design than the box
 * as given — so it needs no user agent and still holds if `TABLE_DESIGN` changes
 * shape.
 *
 * The case it exists for is a phone standing in for a spare tablet: held
 * sideways an iPhone fits the board at ×0.57 and upright-and-turned at ×0.66,
 * because the browser's chrome takes a bigger bite out of the short side.
 */
export const shouldTurn = (box: Box, design: Box = TABLE_DESIGN): boolean =>
  fitScale(turned(box), design) > fitScale(box, design);
