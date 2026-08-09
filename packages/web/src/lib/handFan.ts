/**
 * Fanning your own hand when it is the whole screen.
 *
 * The same trade `fan.ts` makes for the seat strip, with one number changed and
 * one reason changed with it. There, the sliver only has to be *readable*,
 * because nothing about somebody else's cards is tappable. Here every card is a
 * move you make with a thumb, so the floor is set by the tap and not by the
 * rank: 44px of card is comfortably hittable and comfortably legible, and a
 * sliver that satisfied the eye alone would leave you fishing for the right
 * card mid-turn.
 *
 * Loosest first, and it only tightens once it has to. A hand of five in
 * landscape is five whole cards with air between them; a hand of fifteen closes
 * up rather than sliding off the edge, which is the standard #59 set — no hand
 * should ever need scrolling to be read.
 *
 * Pure arithmetic, no DOM, same as `fan.ts`: what the hand does at any width is
 * a test rather than a squint at a phone.
 */

import { CARD_WIDTH_PX, type CardSize } from "../components/Card.tsx";

/** The air between two cards when there is room for air. */
const GAP = 6;

/**
 * The narrowest a card may be squeezed to. Not a legibility floor — a rank and
 * its glyph are clear of the card's own padding well before here — but a **tap**
 * floor, which binds first and binds harder. Below it you are aiming at a
 * stripe. It is an absolute number rather than a fraction of the card for the
 * same reason: a thumb is the same width whatever size the cards are drawn at.
 */
export const TIGHTEST = 44;

/**
 * The same floor for the accusation picker, which fans somebody else's hand at
 * `sm` so it can promise one row whatever they are holding.
 *
 * Lower, because the card is lower: a `sm` card is 40px wide to begin with, so
 * 44 would be no overlap at all and the picker would wrap or scroll instead —
 * which is the thing it exists not to do. It is still a tap floor rather than
 * `fan.ts`'s reading floor of 22, because unlike the seat strip every card in
 * here is a card you accuse somebody with.
 */
export const PICKER_TIGHTEST = 28;

/** No overlap at all: a whole card and its gap. Nothing is ever looser. */
export const loosest = (size: CardSize): number => CARD_WIDTH_PX[size] + GAP;

/** How wide `cards` sit at this step, the last one showing whole. */
export const handWidth = (cards: number, step: number, size: CardSize): number =>
  cards > 0 ? (cards - 1) * step + CARD_WIDTH_PX[size] : 0;

/**
 * How tall the cards may be drawn, from the room the row actually has.
 *
 * The one place the hand view decides how big "as large as it will go" is. It
 * is answered from the *height*, not the card count: cards that grew as a hand
 * shrank would tell the table how many you were holding by how large they
 * looked, and a hand of three would sit there like a billboard. The width is
 * the fan's problem, and the fan solves it by closing up.
 *
 * `xl` needs a row with room for the card, the lift a selected card takes, and
 * the gap under it. Anything shorter falls back to `lg`, which is what the full
 * table draws the pile at, and shorter still to `md`.
 *
 * That last rung is the one a picker needs. `lg` was the floor while nothing
 * ever docked over the hand; with a picker up, the row is left less height than
 * an `lg` card and its padding, and the row scrolls its own overflow rather than
 * admitting it — cards clipped top and bottom at the exact moment the screen is
 * asking you to read a hand. Stepping down again is the whole of the fix: a
 * short row is not a reason to render a broken one.
 */
export const handSize = (rowHeight: number): CardSize =>
  rowHeight >= 216 ? "xl" : rowHeight >= 168 ? "lg" : "md";

/**
 * Left edge to left edge: how much of a card its neighbour leaves showing.
 *
 * Loosest first; it only tightens once it has to. At the floor a landscape
 * phone holds a dozen `xl` cards without scrolling, which is past anything a
 * real hand reaches often. Past that the row scrolls, and that is the accepted
 * cost rather than a tighter sliver — the same call `fan.ts` makes, for the
 * same reason.
 */
export const handStep = (
  available: number,
  cards: number,
  size: CardSize,
  /** Where tightening stops. The picker fans smaller cards, so it sets its own. */
  tightest: number = TIGHTEST,
  /** Landscape IRL hands prefer a tighter fan over any local scrolling. */
  fit = false,
): number => {
  const loose = loosest(size);
  if (cards <= 1 || available <= 0) return loose;
  for (let step = loose; step > tightest; step -= 1) {
    if (handWidth(cards, step, size) <= available) return step;
  }
  if (fit) {
    const fitted = Math.floor((available - CARD_WIDTH_PX[size]) / Math.max(cards - 1, 1));
    return Math.max(18, Math.min(tightest, fitted));
  }
  return tightest;
};
