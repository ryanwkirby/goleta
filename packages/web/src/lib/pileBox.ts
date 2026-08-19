/**
 * How much room the two centre piles actually paint.
 *
 * The shared table screen draws `Piles` larger than the phone does, and it used
 * to get there with `scale-[2.5]` — a paint transform, which the layout around
 * it never sees. So the flex box centring the piles laid them out at their
 * unscaled 198px, centred that in the full height of the design, and *then* the
 * paint grew about its own middle: the painted top of the draw pile landed at
 * design y≈30 with `BAND.top` at 48, and the top seat's name was drawn on top of
 * the deck (#159).
 *
 * The board's guarantee is that anything which does not overlap in the design
 * does not overlap on screen, and that holds for the *board's* quarter turn,
 * which is one uniform transform over everything. A local transform on one
 * child is exactly the thing it does not cover.
 *
 * So the scale is worked out rather than chosen: give the piles the room between
 * the bands, ask `fitScale` how much of this box fits in it, and reserve the
 * answer. It cannot overflow, because the number came from the room it has —
 * and a test holds it against `BAND` at every card size.
 *
 * Pure arithmetic, no DOM, same as `fitScale.ts` and for the same reason: what
 * the board does at any size should be a test rather than a squint at a
 * television. The numbers below are the Tailwind classes in `Piles.tsx` written
 * out; keep them in step by hand, the way `CARD_WIDTH_PX` tracks `SIZES`.
 */

import { CARD_HEIGHT_PX, CARD_WIDTH_PX, type CardSize } from "../components/Card.tsx";
import { fitScale, type Box, type Point } from "./fitScale.ts";

/** `gap-6` between the draw pile and the card in play. */
const BETWEEN = 24;

/** `gap-1.5` under each card, and the caption's own `h-4`. */
const CAPTION = 6 + 16;

/**
 * The suit circle hangs off the corner of the card in play — `-bottom-3
 * -right-3` on a `h-12 w-12` — so it paints twelve pixels past the right-hand
 * edge.
 *
 * Counted on **both** sides, which looks like a mistake and is not. The piles
 * are centred in the box, so a box that allowed for the overhang only on the
 * side it is on would put its own centre twelve pixels off the piles' centre and
 * hand the overhang back. Twelve pixels of unused room on the left is the price
 * of the right-hand side being exact.
 *
 * Vertically it needs nothing: the circle drops twelve past the card and the
 * caption row under it is twenty-two deep, so it is already inside.
 */
const BADGE = 12;

export const pileBox = (size: CardSize): Box => ({
  width: CARD_WIDTH_PX[size] * 2 + BETWEEN + BADGE * 2,
  height: CARD_HEIGHT_PX[size] + CAPTION,
});

/**
 * Where the middle of the draw pile ends up, given the room the piles were
 * fitted into and the point that room is centred on.
 *
 * Both views centre the box, so the deck's place is the box's centre plus a
 * fixed offset scaled by however much the fitting shrank things. The two cards
 * and their gap are centred inside the box, and the deck is the left of the
 * pair — so it sits half a card and half a gap to the left of centre, whatever
 * the badge allowance is doing on the far side. Vertically the caption hangs
 * under both cards, so the cards' middle is half a caption above the box's.
 *
 * A card being drawn should leave the deck it came off (#164). It used to
 * appear out of empty felt in the middle of the board, which is nowhere in
 * particular and, on this board, not even close to the deck.
 */
export const deckPoint = (room: Box, centre: Point, size: CardSize): Point => {
  const scale = fitScale(room, pileBox(size));
  return {
    x: centre.x - ((CARD_WIDTH_PX[size] + BETWEEN) / 2) * scale,
    y: centre.y - (CAPTION / 2) * scale,
  };
};

/**
 * The other half of the pair: where the card in play sits.
 *
 * The same arithmetic mirrored, because the two cards and their gap are centred
 * inside the box — so the pile is as far right of centre as the deck is left of
 * it. Read by the reshuffle, which is the one thing on this screen that travels
 * pile → deck rather than deck → somewhere (#209).
 */
export const pilePoint = (room: Box, centre: Point, size: CardSize): Point => {
  const scale = fitScale(room, pileBox(size));
  return {
    x: centre.x + ((CARD_WIDTH_PX[size] + BETWEEN) / 2) * scale,
    y: centre.y - (CAPTION / 2) * scale,
  };
};
