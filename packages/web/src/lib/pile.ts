/**
 * What the pile says about the suit, which is the one thing the card on it
 * can't: a suit somebody *named*, or one they have been asked for and not given.
 *
 * Inferring the named half by comparing `activeSuit` against the printed card
 * was silent on the one play that matters — naming the 8's own suit (#114). #76
 * removed the badge that named a stale suit through the owed window, and #150
 * put the *question* back, because silence made a board about to be replaced
 * look exactly like a settled one.
 *
 * One silence survives, out of the rule rather than as a special case: **a card
 * still in flight says nothing**, which is also what keeps Dealer's Choice
 * honest (#75).
 */

import type { Card, GameView, Suit } from "@goleta/engine";

/**
 * Not a nullable `Suit` with a flag beside it: the two are drawn in the same
 * place, so one answer stops a badge meaning "waiting" being read as "clubs".
 * **`named` is a claim**, read out as "spades called", so it is the wrong type
 * for a suit that was merely printed.
 */
export type PileSuit = { kind: "owed" } | { kind: "named"; suit: Suit };

export const pileSuit = (game: GameView, showing: Card | null): PileSuit | null => {
  if (!showing) return null;
  if (showing.id !== game.topCard.id) return null;
  if (game.phase.kind === "suit") return { kind: "owed" };
  return game.namedSuit === null ? null : { kind: "named", suit: game.namedSuit };
};
