/**
 * A card's measurements, and the two ways a suit is written down. Pure
 * arithmetic — nothing that renders, which stays in `components/Card.tsx`.
 * Half of `lib/` needs these, and reaching into a component file for them is
 * what put `lib` and `components` in a cycle (#224).
 */

import type { Suit } from "@goleta/engine";

export const SUIT_GLYPH: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
export const SUIT_LABEL: Record<Suit, string> = {
  C: "clubs",
  D: "diamonds",
  H: "hearts",
  S: "spades",
};

export const isRed = (suit: Suit): boolean => suit === "D" || suit === "H";

/**
 * `xl` is for one screen: a phone in landscape at an IRL table, where your own
 * hand is the whole display (#78). `2xl` is the same screen once the row of
 * furniture under the hand was gone (#131), and `handSize` is the only thing
 * that names it.
 */
export type CardSize = "sm" | "md" | "lg" | "xl" | "2xl";

/** In pixels at the default root font size. Read as a *ratio* between a pair,
 * and by `handFan.ts`; browser zoom skews neither. Keep in step with `SIZES`. */
export const CARD_WIDTH_PX: Record<CardSize, number> = {
  sm: 40,
  md: 68,
  lg: 96,
  xl: 132,
  "2xl": 180,
};

export const CARD_HEIGHT_PX: Record<CardSize, number> = {
  sm: 56,
  md: 96,
  lg: 128,
  xl: 176,
  "2xl": 240,
};

/**
 * A card's shape as fractions of its own height, read off `2xl`. The landscape
 * hand is the one place that wants a size *between* the rungs — it is handed a
 * row and should fill it (#166). Every other card in the app is a rung and
 * should stay one.
 */
export interface CardShape {
  width: number;
  text: number;
  pad: number;
  radius: number;
}

export const CARD_SHAPE: CardShape = { width: 0.75, text: 0.2167, pad: 0.05, radius: 0.1 };

/**
 * The same card in large print (#323), and **a different face rather than a
 * bigger `text`**. The fractions above describe the ordinary face: a corner
 * index with the rest of the card left for the ghost pip. Set `text` to 0.42 in
 * there and a rank runs off the edge, silently, because the card is
 * `overflow-hidden`.
 *
 * So this face is one centred rank with its suit under it, and nothing else. A
 * corner index and a ghost pip are a **convention**, and #323 rules that
 * legibility outranks the convention here: 0.42 against 0.2167 is nearly twice
 * the ink, on top of everything already being 1.3× bigger.
 *
 * The two figures are what will fit and still clear the edges, and `10` is the
 * binding case both ways. Across: two digits of a semibold sans measure about
 * 1.15em, so 0.42 × 1.15 = 0.48 of a card 0.75 wide, inside 0.04 of padding
 * either side. Down: the rank's line plus the suit's, which is drawn at 0.85em
 * like the ordinary face, comes to about 0.82 of the height. `cardLadder.test.ts`
 * holds both.
 */
export const LARGE_CARD_SHAPE: CardShape = { width: 0.75, text: 0.42, pad: 0.04, radius: 0.1 };

export const shapeFor = (large: boolean): CardShape => (large ? LARGE_CARD_SHAPE : CARD_SHAPE);

export const cardWidthAt = (height: number): number => Math.round(height * CARD_SHAPE.width);

/**
 * A rung's width and height, with large print's scale already in it.
 *
 * The ladder itself does not move: it is written in two places — here in pixels,
 * for `fan.ts` and `handFan.ts`, and in `SIZES` in `Card.tsx` as rem-based
 * classes — and **the two have to move together** (#323). They do, because large
 * print moves the root font size and multiplies these by the same number.
 */
export const cardWidthPx = (size: CardSize, scale = 1): number =>
  CARD_WIDTH_PX[size] * scale;

export const cardHeightPx = (size: CardSize, scale = 1): number =>
  CARD_HEIGHT_PX[size] * scale;
