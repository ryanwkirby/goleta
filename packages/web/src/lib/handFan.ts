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

/**
 * The floor for a hand that has been told to fit rather than scroll (#117).
 *
 * Below `TIGHTEST`, which the comment above calls absolute — and it still is,
 * *as a tap floor*. What changes here is that there is no longer a tap to
 * protect: a hand fitted past this point stops committing on the first tap, so
 * the first one only has to land on the right card to raise it, and the second
 * is aimed at a whole card lifted clear of its neighbours. The floor left is
 * the reading one `fan.ts` uses for the seat strip, and this sits above it.
 *
 * It binds far later than it looks. A landscape phone holds fifteen `2xl` cards
 * at `TIGHTEST` and the simulation's worst hand across three hundred games is
 * twelve, so the squeeze is for small phones and freak endgames, not for the
 * ordinary turn.
 */
export const FIT_TIGHTEST = 18;

/** No overlap at all: a whole card and its gap. Nothing is ever looser. */
export const loosest = (cardWidth: number): number => cardWidth + GAP;

/** How wide `cards` sit at this step, the last one showing whole. */
export const handWidth = (cards: number, step: number, cardWidth: number): number =>
  cards > 0 ? (cards - 1) * step + cardWidth : 0;

/**
 * The air the hand keeps around itself: `py-4` above and below the cards.
 *
 * Both halves earn it. The top has to clear the lift a selected card takes, and
 * the bottom is what centres the cards inside the turn ring drawn round them —
 * without it the hand sits visibly low in its own frame.
 */
const AIR = 32;

/**
 * The tallest a card is drawn, however much room there is.
 *
 * This view is gated on a phone, so the ceiling is not really about space; it
 * is about a card that stops looking like a card. A little over the old `2xl`
 * is as far as it is worth going.
 */
export const TALLEST = 300;

/**
 * The shortest, which is the one a docked picker needs. Below this the hand is
 * no longer readable and scrolling is the better failure.
 */
export const SHORTEST = 96;

/**
 * How tall the cards are drawn, from the room the row actually has.
 *
 * The one place the hand view decides how big "as large as it will go" is. It
 * is answered from the *height*, not the card count: cards that grew as a hand
 * shrank would tell the table how many you were holding by how large they
 * looked, and a hand of three would sit there like a billboard. The width is
 * the fan's problem, and the fan solves it by closing up.
 *
 * **A number rather than a rung** since #166. It used to pick one of four card
 * sizes off a ladder whose top two steps are sixty-four pixels apart, so a row
 * of 280 drew a 240 card and a row of 279 drew a 176 — two-fifths of the height
 * given back over one pixel, and on the ordinary phone the leftover was a band
 * of bare felt under the cards on a screen that exists to show them. Now the
 * cards are simply as tall as the row minus the air they keep, and the ladder
 * stays where every other card in the app still uses it.
 *
 * It still falls back smoothly, which is what a docked picker needs: the row is
 * measured, so a picker taking its room out of the column shrinks the cards by
 * exactly what it took rather than by a rung, and nothing in the column ever
 * has to scroll to fit (#96).
 */
export const handHeight = (rowHeight: number): number =>
  Math.max(SHORTEST, Math.min(TALLEST, Math.floor(rowHeight - AIR)));

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
  /** How wide one card is — a rung's width, or a height off `cardWidthAt`. */
  cardWidth: number,
  /** Where tightening stops. The picker fans smaller cards, so it sets its own. */
  tightest: number = TIGHTEST,
  /**
   * Landscape IRL hands prefer a tighter fan over any local scrolling, down to
   * `FIT_TIGHTEST` — past which they scroll after all, because a hand that big
   * has left legibility behind as well as the tap.
   */
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
