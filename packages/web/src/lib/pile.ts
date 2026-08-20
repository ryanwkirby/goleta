/**
 * What the pile says about the suit, which is the one thing the card on it
 * can't: a suit somebody *named*, or one they have been asked for and not given.
 *
 * The named half comes from `namedSuit`. Inferring it by comparing `activeSuit`
 * against the printed card was silent on the one play that matters — naming the
 * 8's own suit (#114). The owed half is the window between an 8 landing and the
 * answer arriving; #76 removed the badge that named a stale suit through it, and
 * #150 put the *question* back, because silence made a board about to be
 * replaced look exactly like a settled one.
 *
 * One silence survives, out of the rule rather than as a special case: **a card
 * still in flight says nothing**, since `pileFace` holds the pile on the card a
 * flight is landing on. That is also what keeps Dealer's Choice honest (#75).
 */

import type { Card, GameView, Suit } from "@goleta/engine";

/**
 * Not a nullable `Suit` with a flag beside it: the two are drawn in the same
 * place, so one answer is what stops a badge meaning "waiting" being read as one
 * meaning "clubs".
 *
 * **`named` is a claim**, read out as "spades called", so it is the wrong type
 * for a suit that was merely printed — an upcard, a recycle, a card played to
 * settle a call.
 */
export type PileSuit = { kind: "owed" } | { kind: "named"; suit: Suit };

export const pileSuit = (game: GameView, showing: Card | null): PileSuit | null => {
  if (!showing) return null;
  if (showing.id !== game.topCard.id) return null;
  if (game.phase.kind === "suit") return { kind: "owed" };
  return game.namedSuit === null ? null : { kind: "named", suit: game.namedSuit };
};
