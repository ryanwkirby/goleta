/**
 * Whether a suit has been *named*, and which — the one thing the pile says that
 * the card on it can't.
 *
 * `activeSuit` is not that answer on its own. It is the suit that has to be
 * matched right now, and there are two moments in a game where it differs from
 * the card the table is looking at for reasons that have nothing to do with
 * anybody naming anything:
 *
 *   - **A suit is owed and nobody has named one yet.** `applyPlay` deliberately
 *     leaves `activeSuit` alone for a wild card, so between the 8 landing and
 *     the answer arriving it still holds the suit that was live *before* the 8.
 *     The engine is right — that is the last true answer, and playability isn't
 *     consulted during a `suit` phase — but read as a call it is a confident
 *     badge naming a suit nobody chose, for as long as it takes a person to
 *     decide or a bot to take its beat (#76).
 *   - **A card is still in flight.** `pileFace` holds the pile on the card a
 *     flight is landing on until it lands, while `activeSuit` moves the instant
 *     the event arrives. Every event that changes the suit in play therefore has
 *     a window, one flight long, where the two describe different cards — most
 *     visibly across a recycle, where `turnUp` sets the suit from a card the
 *     pile has not shown yet.
 *
 * So the rule is: **the badge describes the card the pile is actually showing,
 * or it says nothing.** Null covers all of it — no card up, no answer yet, or an
 * answer that isn't about the card up — and every caller draws nothing at all
 * rather than a placeholder, which is what the pile already does through a deal.
 */

import type { Card, GameView, Suit } from "@goleta/engine";

export const calledSuit = (game: GameView, showing: Card | null): Suit | null => {
  if (!showing) return null;
  if (game.phase.kind === "suit") return null;
  if (showing.id !== game.topCard.id) return null;
  return game.activeSuit === showing.suit ? null : game.activeSuit;
};
