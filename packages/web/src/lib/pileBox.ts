/**
 * How much room the two centre piles actually paint.
 *
 * They used to be drawn with `scale-[2.5]`, and a paint transform is invisible
 * to the layout: the piles were laid out at their unscaled size, centred in the
 * design, and the ink then grew about its own middle into the band the seat
 * names live in (#159). The board's no-overlap guarantee covers its own uniform
 * quarter turn, not a local transform on one child.
 *
 * So the scale is asked for: give the piles the room between the bands, ask
 * `fitScale` how much of this box fits, and reserve the answer. The numbers
 * below are the Tailwind classes in `Piles.tsx` written out; keep them in step.
 */

import { CARD_HEIGHT_PX, CARD_WIDTH_PX, type CardSize } from "./cardShape.ts";
import { fitScale, type Box, type Point } from "./fitScale.ts";

/** `gap-6` between the draw pile and the card in play. */
const BETWEEN = 24;

/** `gap-1.5` under each card, and the caption's own `h-4`. */
const CAPTION = 6 + 16;

/** The suit circle hangs twelve pixels past the card's right edge. Counted on
 * **both** sides, which looks wrong: the piles are centred, so allowing for it
 * on one side moves the box's centre and hands the overhang back. */
const BADGE = 12;

export const pileBox = (size: CardSize): Box => ({
  width: CARD_WIDTH_PX[size] * 2 + BETWEEN + BADGE * 2,
  height: CARD_HEIGHT_PX[size] + CAPTION,
});

/** The box's centre plus a fixed offset, scaled by however much the fitting
 * shrank things. A card being drawn should leave the deck it came off rather
 * than empty felt in the middle of the board (#164). */
export const deckPoint = (room: Box, centre: Point, size: CardSize): Point => {
  const scale = fitScale(room, pileBox(size));
  return {
    x: centre.x - ((CARD_WIDTH_PX[size] + BETWEEN) / 2) * scale,
    y: centre.y - (CAPTION / 2) * scale,
  };
};

/** Read by the reshuffle, the one thing here that travels pile → deck (#209). */
export const pilePoint = (room: Box, centre: Point, size: CardSize): Point => {
  const scale = fitScale(room, pileBox(size));
  return {
    x: centre.x + ((CARD_WIDTH_PX[size] + BETWEEN) / 2) * scale,
    y: centre.y - (CAPTION / 2) * scale,
  };
};
