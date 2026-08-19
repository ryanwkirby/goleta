/**
 * What your own cards will do if you tap one, and whether the app is pointing
 * at the answer.
 *
 * Two decisions, both one expression long, both previously buried a few hundred
 * lines apart in the middle of a 900-line component, and both of them about the
 * rule this whole game turns on (#225). `assist` in particular is the most
 * rules-sensitive line in the app: it decides whether a player can be caught
 * out, which is the entire subject of the Sunny Rule.
 *
 * Pure, so both can finally be held to a test — including the assertion that
 * matters most, which is that `assist` is **false** the rest of the time.
 */

import type { GameView } from "@goleta/engine";

/** What tapping a card does. `idle` means the hand is not asking for anything. */
export type HandMode = "play" | "forced" | "surrender" | "idle";

/**
 * Whether the table is marking up your playable cards.
 *
 * Three sources, and #187 changed exactly one of them. `hints` is your own
 * standing preference, read live, set from the rules screen or your own cog and
 * changeable at any time — it used to be `finishedGames === 0 && wantedHints`,
 * a countdown nobody set which expired after one game.
 *
 * The other two are untouched. `sunnyPlay` is the play you owe after a call has
 * landed on you: you have already been caught, the move is forced, and there is
 * nothing left to fumble. And `helpedTurn` is a single turn bought with `want
 * help?`, out loud, in front of everybody.
 *
 * Being caught out having a play you didn't make is the whole subject of the
 * Sunny Rule, and an app that points at the answer never lets anyone be caught —
 * which is why turning this on is public. See `SeatView.hinted`.
 *
 * It is **presentation, never a rule**: `packages/engine` does not learn it
 * exists, it is not on `GameOptions` or `HouseRules`, and no bot may read it.
 */
export const assisting = (
  game: GameView,
  /** Your own standing preference, read live. */
  hints: boolean,
  /** The turn a single `want help?` was bought for, if any. */
  helpedTurn: number | null,
): boolean => game.phase.kind === "sunnyPlay" || hints || helpedTurn === game.turnNumber;

/**
 * What your hand is for, right now.
 *
 * The first branch is the one worth knowing about: the hand goes **dead** from
 * the moment a call lands on you until you have dismissed the dialog. The tap
 * that would fire the forced play is very often the tail of the one that drew
 * the card you were caught for, and a punishment served before you have watched
 * the evidence and read the sentence isn't one.
 */
export const handMode = (
  game: GameView,
  /** The table is waiting on you. `waitingOn`, not whose turn it is. */
  mine: boolean,
  /** A call has landed on you and the dialog is still up. */
  caughtHold: boolean,
): HandMode => {
  if (caughtHold) return "idle";
  if (game.phase.kind === "surrender" && game.phase.playerId === game.you) return "surrender";
  if (mine && game.phase.kind === "sunnyPlay") return "forced";
  if (mine && game.phase.kind === "action") return "play";
  return "idle";
};
