/**
 * Fanning your own hand when it is the whole screen — the same trade `fan.ts`
 * makes for the seat strip, with the floor set by the thumb rather than the eye,
 * because here every card is a move you make. Loosest first, tightening only
 * once it has to: no hand should ever need scrolling to be read (#59).
 */

const GAP = 6;

/** A **tap** floor, not a legibility one, which binds first and binds harder. An
 * absolute number: a thumb is the same width whatever size the cards are. */
export const TIGHTEST = 44;

/** The same floor for the picker, which fans at `sm`. Lower because a `sm` card
 * is 40px wide, so 44 would be no overlap and the picker would wrap or scroll —
 * the thing it exists not to do. */
export const PICKER_TIGHTEST = 28;

/**
 * The floor for a hand told to fit rather than scroll (#117). Below `TIGHTEST`,
 * which is still absolute *as a tap floor* — but a hand fitted past this point
 * stops committing on the first tap, so what is left to protect is reading.
 *
 * It binds far later than it looks: a landscape phone holds fifteen `2xl` cards
 * at `TIGHTEST` and the simulation's worst hand across three hundred games is
 * twelve.
 */
export const FIT_TIGHTEST = 18;

export const loosest = (cardWidth: number): number => cardWidth + GAP;

export const handWidth = (cards: number, step: number, cardWidth: number): number =>
  cards > 0 ? (cards - 1) * step + cardWidth : 0;

/** `py-4`: the top clears the lift a selected card takes, the bottom centres the
 * cards inside the turn ring. */
const AIR = 32;

/** Not about space — this view is gated on a phone — but about a card that stops
 * looking like a card. */
export const TALLEST = 300;

/** What a docked picker needs. Below this, scrolling is the better failure. */
export const SHORTEST = 96;

/**
 * Answered from the *height*, never the card count: cards that grew as a hand
 * shrank would tell the table how many you hold. A number rather than a rung
 * since #166, so a docked picker shrinks the cards by exactly what it took.
 */
export const handHeight = (rowHeight: number): number =>
  Math.max(SHORTEST, Math.min(TALLEST, Math.floor(rowHeight - AIR)));

/** Loosest first; past the floor the row scrolls, which is the accepted cost
 * rather than a tighter sliver — the same call `fan.ts` makes. */
export const handStep = (
  available: number,
  cards: number,
  /** A rung's width, or a height off `cardWidthAt`. */
  cardWidth: number,
  /** The picker fans smaller cards, so it sets its own. */
  tightest: number = TIGHTEST,
  /** Landscape IRL hands prefer a tighter fan over any local scrolling. */
  fit = false,
): number => {
  const loose = loosest(cardWidth);
  if (cards <= 1 || available <= 0) return loose;
  for (let step = loose; step > tightest; step -= 1) {
    if (handWidth(cards, step, cardWidth) <= available) return step;
  }
  if (fit) {
    const fitted = Math.floor((available - cardWidth) / Math.max(cards - 1, 1));
    return Math.max(FIT_TIGHTEST, Math.min(tightest, fitted));
  }
  return tightest;
};
