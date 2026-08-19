/**
 * A card's measurements, and the two ways a suit is written down.
 *
 * Pure arithmetic and four glyphs — no React, no DOM, nothing that renders.
 * It lives here rather than in `components/Card.tsx`, where it grew up,
 * because half of `lib/` needs it: `format.ts` writes suits into sentences,
 * `pileBox.ts` works out how much the centre piles paint, `handFan.ts` fits a
 * fan against a measured row, and `motion/plan.ts` sizes a card in flight
 * against the one it is flying towards. All four had to reach into a component
 * file to get it, which is what put `lib` and `components` in a cycle with each
 * other and `motion` in a second one (#224).
 *
 * The component file keeps everything that draws: the Tailwind class per rung,
 * `PlayingCard`, `CardBack`, `SuitMark`.
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
 * `xl` exists for one screen: a phone in landscape at an IRL table, where your
 * own hand is the entire point of the display and there is finally the height
 * to draw it properly (#78). On any layout that has a seat strip to fit as
 * well, it is simply too big — the shared table screen borrows it for the two
 * centre piles, which are that screen's whole subject, and nothing else should.
 *
 * `2xl` is the same screen once the row of furniture under the hand was gone
 * (#131). `xl` was never the biggest card that fitted; it was the biggest one
 * that fitted with a footer, and the landscape row is around 300px on every
 * phone this view is for. The type steps up with it, because the index in the
 * corner is what a fanned hand is read from and the phone is on a table rather
 * than in your face. This one really is for the hand alone: `handSize` is the
 * only thing that names it.
 */
export type CardSize = "sm" | "md" | "lg" | "xl" | "2xl";


/**
 * The widths above, in pixels at the default root font size. Two things read
 * them: the *ratio* between a pair, to size a card in flight against the one it
 * is flying towards, and the arithmetic in `handFan.ts`. A browser zoom or a
 * bigger root font skews neither — the first is a ratio, and the second is
 * fitted against a width that was measured at the same zoom. Keep them in step
 * with `SIZES` anyway.
 */
export const CARD_WIDTH_PX: Record<CardSize, number> = {
  sm: 40,
  md: 68,
  lg: 96,
  xl: 132,
  "2xl": 180,
};

/**
 * The heights, same rule. Read by `pileBox.ts`, which works out how much room
 * the two centre piles paint so the shared table screen can fit them into the
 * space between its bands rather than scaling them by a number somebody picked
 * (#159).
 */
export const CARD_HEIGHT_PX: Record<CardSize, number> = {
  sm: 56,
  md: 96,
  lg: 128,
  xl: 176,
  "2xl": 240,
};

/**
 * A card's shape, as fractions of its own height.
 *
 * The ladder above is five rungs, and the landscape hand is the one place that
 * wants a size *between* them: it is handed a row and should fill it, not fall
 * back sixty-four pixels because the row came up one short (#166). So that view
 * draws at a height it works out, and everything else about the card follows
 * from these — which are read off `2xl`, the rung it replaces, so a card drawn
 * this way at 240 is the `2xl` card to the pixel.
 *
 * Only `handFan.ts` and the landscape hand use them. Every other card in the
 * app is a rung, and should stay one: the ladder is what keeps a card the same
 * size in a seat strip on two different screens.
 */
export const CARD_SHAPE = { width: 0.75, text: 0.2167, pad: 0.05, radius: 0.1 } as const;

/** How wide a card of this height is. The fan needs it to know what it is fitting. */
export const cardWidthAt = (height: number): number => Math.round(height * CARD_SHAPE.width);
