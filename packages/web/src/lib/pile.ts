/**
 * What the pile says about the suit, which is the one thing the card on it
 * can't: a suit somebody *named*, or a suit somebody has been asked for and
 * hasn't answered yet.
 *
 * The named half comes from `namedSuit`, which the engine sets only in
 * `chooseSuit` and clears wherever the card in play changes. It used to be
 * inferred here, by asking whether `activeSuit` differed from the suit printed
 * on the card, and that comparison was wrong in the one direction that mattered:
 * a player who names the 8's own suit has made a real play — it is how you leave
 * the next seat something to follow — and the table was shown nothing at all
 * (#114).
 *
 * The owed half is the window between an 8 landing and the answer arriving.
 * `handlePlay` deliberately leaves `activeSuit` alone for a wild card, so
 * through that window it still holds the suit that was live *before* the 8. The
 * engine is right — that is the last true answer — but read as a call it was a
 * confident badge naming a suit nobody chose, which is what #76 took out. What
 * #76 left behind was silence, and silence turned out to be the more expensive
 * mistake: a board that is about to be replaced looks exactly like a board that
 * has settled, and a player reading their hand against it reaches for the deck a
 * second before the suit lands and makes that reach illegal (#150). So the gap
 * says something now. It is the question #76 left open, answered the other way.
 *
 * One silence survives, and falls out of the rule rather than being a special
 * case. **A card still in flight says nothing.** `pileFace` holds the pile on the
 * card a flight is landing on until it lands, while the state moves the instant
 * the event arrives. Every event that changes the card in play therefore has a
 * window, one flight long, where the two describe different cards — most visibly
 * across a recycle, where `turnUp` sets the suit from a card the pile has not
 * shown yet. The top-card check below covers it, and it is also what keeps
 * Dealer's Choice honest: that game opens in `phase: "suit"` before the upcard
 * has landed (#75), and a suit cannot be owed for a card nobody can see.
 *
 * So the rule is unchanged: **the pile describes the card it is actually
 * showing, or it says nothing.** Null still covers no card up, an answer that
 * isn't about the card up, and the ordinary case of a card whose suit is
 * printed on its face.
 */

import type { Card, GameView, Suit } from "@goleta/engine";

/**
 * `owed` is a suit somebody has been asked for; `named` is the one they gave.
 * Deliberately not a nullable `Suit` with a flag beside it — the two states are
 * drawn in the same place and the caller has to pick between them, so making
 * them one answer is what stops a badge that means "waiting" being read as one
 * that means "clubs".
 *
 * **`named` is a claim, and it is read out as one.** `SuitMark` renders it
 * "spades called" for whoever is listening rather than looking, so this is the
 * wrong type for a suit that was merely *printed* — an upcard, a card turned up
 * by a recycle, the card played to settle a call. Every one of those leaves a
 * board with a live suit and nobody who chose it, and drawing one through here
 * puts a claim in the screen-reader text that nothing at the table made. It is
 * the same distinction `namedSuit` exists for on the game state, arriving one
 * layer further out: `activeSuit` says which suit must be matched, and only
 * this says a person picked it.
 */
export type PileSuit = { kind: "owed" } | { kind: "named"; suit: Suit };

export const pileSuit = (game: GameView, showing: Card | null): PileSuit | null => {
  if (!showing) return null;
  if (showing.id !== game.topCard.id) return null;
  if (game.phase.kind === "suit") return { kind: "owed" };
  return game.namedSuit === null ? null : { kind: "named", suit: game.namedSuit };
};
