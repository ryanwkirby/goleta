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

/** The heights, same rule. Read by `pileBox.ts` (#159). */
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
export const CARD_SHAPE = { width: 0.75, text: 0.2167, pad: 0.05, radius: 0.1 } as const;

/** How wide a card of this height is; the fan needs it to know what it fits. */
export const cardWidthAt = (height: number): number => Math.round(height * CARD_SHAPE.width);
