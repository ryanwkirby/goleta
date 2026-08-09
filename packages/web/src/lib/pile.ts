/**
 * Whether a suit has been *named*, and which — the one thing the pile says that
 * the card on it can't.
 *
 * The answer comes from `namedSuit`, which the engine sets only in `chooseSuit`
 * and clears wherever the card in play changes. It used to be inferred here, by
 * asking whether `activeSuit` differed from the suit printed on the card, and
 * that comparison was wrong in the one direction that mattered: a player who
 * names the 8's own suit has made a real play — it is how you leave the next
 * seat something to follow — and the table was shown nothing at all (#114).
 *
 * Two silences survive the change, and fall out of it rather than being special
 * cases:
 *
 *   - **A suit is owed and nobody has named one yet.** `applyPlay` deliberately
 *     leaves `activeSuit` alone for a wild card, so between the 8 landing and
 *     the answer arriving it still holds the suit that was live *before* the 8.
 *     The engine is right — that is the last true answer, and playability isn't
 *     consulted during a `suit` phase — but read as a call it was a confident
 *     badge naming a suit nobody chose (#76). `namedSuit` is null through that
 *     whole window, because the play cleared it and nothing has answered.
 *   - **A card is still in flight.** `pileFace` holds the pile on the card a
 *     flight is landing on until it lands, while the state moves the instant the
 *     event arrives. Every event that changes the card in play therefore has a
 *     window, one flight long, where the two describe different cards — most
 *     visibly across a recycle, where `turnUp` sets the suit from a card the
 *     pile has not shown yet. The top-card check below covers it.
 *
 * So the rule is unchanged: **the badge describes the card the pile is actually
 * showing, or it says nothing.** Null covers all of it — no card up, no answer
 * yet, or an answer that isn't about the card up — and every caller draws
 * nothing at all rather than a placeholder, which is what the pile already does
 * through a deal.
 */

import type { Card, GameView, Suit } from "@goleta/engine";

export const calledSuit = (game: GameView, showing: Card | null): Suit | null => {
  if (!showing) return null;
  if (showing.id !== game.topCard.id) return null;
  return game.namedSuit;
};
