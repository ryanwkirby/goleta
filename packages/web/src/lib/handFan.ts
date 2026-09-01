/**
 * Fanning your own hand when it is the whole screen — the same trade `fan.ts`
 * makes for the seat strip, with the floor set by the thumb rather than the eye,
 * because here every card is a move you make. Loosest first, tightening only
 * once it has to: no hand should ever need scrolling to be read (#59).
 */

const GAP = 6;

/**
 * Which of these move in large print (#323), and which do not.
 *
 * `GAP`, `AIR`, `TALLEST` and `SHORTEST` are rems written out in pixels, and
 * `FIT_TIGHTEST` is about reading — so all five take the scale, exactly as the
 * ladder they are measured against does. **The two tap floors do not**, because
 * a thumb is the same width whatever size the cards are. That asymmetry is the
 * whole of what this file has to get right: a larger card tightened to the same
 * sliver buys nothing, and a larger card given a larger tap target buys a second
 * tap that was never needed.
 */

/** A **tap** floor, not a legibility one, which binds first and binds harder. An
 * absolute number: a thumb is the same width whatever size the cards are, and
 * that includes large print. */
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

export const loosest = (cardWidth: number, scale = 1): number => cardWidth + GAP * scale;

export const handWidth = (cards: number, step: number, cardWidth: number): number =>
  cards > 0 ? (cards - 1) * step + cardWidth : 0;

/** `py-4`: the top clears the lift a selected card takes, the bottom centres the
 * cards inside the turn ring. */
const AIR = 32;

/** Not about space — this view is gated on a phone — but about a card that stops
 * looking like a card. It scales, because large print is the one mode where that
 * is explicitly allowed: its face is a rank and a suit and nothing else (#323). */
export const TALLEST = 300;

/** What a docked picker needs. Below this, scrolling is the better failure. */
export const SHORTEST = 96;

/**
 * Answered from the *height*, never the card count: cards that grew as a hand
 * shrank would tell the table how many you hold. A number rather than a rung
 * since #166, so a docked picker shrinks the cards by exactly what it took.
 */
export const handHeight = (rowHeight: number, scale = 1): number =>
  Math.max(
    SHORTEST * scale,
    Math.min(TALLEST * scale, Math.floor(rowHeight - AIR * scale)),
  );

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
  /** How much bigger this device draws everything (#323). `cardWidth` arrives
   * already scaled, because its caller had to pick a rung or measure a row; what
   * this is for is the gap between the cards and the floor under them. */
  scale = 1,
): number => {
  const loose = loosest(cardWidth, scale);
  if (cards <= 1 || available <= 0) return loose;
  for (let step = loose; step > tightest; step -= 1) {
    if (handWidth(cards, step, cardWidth) <= available) return step;
  }
  if (fit) {
    const fitted = Math.floor((available - cardWidth) / Math.max(cards - 1, 1));
    return Math.max(FIT_TIGHTEST * scale, Math.min(tightest, fitted));
  }
  return tightest;
};
