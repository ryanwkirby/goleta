/**
 * Fitting one fixed design into whatever screen it has been given. The shared
 * table screen (#14) runs at anything from a tablet at arm's length to a
 * television, so it is laid out once and scaled. Sizing each piece in viewport
 * units instead gets the type right and the *relationships* wrong.
 */

export interface Box {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Wide, because #14 assumes landscape. */
export const TABLE_DESIGN: Box = { width: 1000, height: 560 };

/** The smaller of the two ratios, so nothing is ever cropped. Allowed to scale
 * *up* without limit, since a television is the case it exists for. */
export const fitScale = (box: Box, design: Box = TABLE_DESIGN): number => {
  if (box.width <= 0 || box.height <= 0) return 1;
  if (design.width <= 0 || design.height <= 0) return 1;
  return Math.min(box.width / design.width, box.height / design.height);
};

export const turned = (box: Box): Box => ({ width: box.height, height: box.width });

/**
 * Whether to turn the board a quarter (#141). Asked as arithmetic — does the
 * turned box fit more of the design than the box as given — so it needs no user
 * agent and still holds if `TABLE_DESIGN` changes shape. The case it exists for
 * is a phone standing in for a spare tablet: ×0.57 held sideways against ×0.66
 * upright-and-turned, because chrome takes a bigger bite out of the short side.
 */
export const shouldTurn = (box: Box, design: Box = TABLE_DESIGN): boolean =>
  fitScale(turned(box), design) > fitScale(box, design);
