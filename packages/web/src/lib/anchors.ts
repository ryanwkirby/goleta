/**
 * Names for the places a card can be. **Region** anchors — `deck`, `pile`,
 * `hand`, `seat:<id>` — are always on screen, so a flight can always fall back
 * to one. **Card** anchors come and go with the card, and the one a flight
 * starts from has usually just left the DOM, which is why every commit's
 * geometry is kept for exactly one more commit: see `before`.
 */

export type AnchorKey = string;

export const DECK: AnchorKey = "deck";
export const PILE: AnchorKey = "pile";
export const HAND: AnchorKey = "hand";
export const seatAnchor = (playerId: string): AnchorKey => `seat:${playerId}`;
export const cardAnchor = (cardId: string): AnchorKey => `card:${cardId}`;

export interface AnchorGeometry {
  /** Where an anchor is right now, in the DOM as it currently stands. */
  live: (key: AnchorKey) => DOMRect | null;
  /** Where it was immediately before the update being animated. */
  before: (key: AnchorKey) => DOMRect | null;
}

/** The first of `keys` that resolves anywhere, current DOM preferred. A card
 * that just left the hand resolves in the previous commit's snapshot and one
 * that just arrived in the live DOM; one lookup order covers both. */
export const resolveAnchor = (keys: readonly AnchorKey[], at: AnchorGeometry): DOMRect | null => {
  for (const key of keys) {
    const rect = at.live(key) ?? at.before(key);
    if (rect && rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
};
