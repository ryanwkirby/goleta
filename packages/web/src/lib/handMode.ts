/**
 * What your own cards will do if you tap one, and whether the app is pointing at
 * the answer. Both were buried a few hundred lines apart in a 900-line component
 * (#225), and `assist` is the most rules-sensitive line in the app: it decides
 * whether a player can be caught out, which is the subject of the Sunny Rule.
 */

import type { GameView } from "@goleta/engine";

export type HandMode = "play" | "forced" | "surrender" | "idle";

/**
 * Whether the table is marking up your playable cards. Three sources, of which
 * #187 changed one: `hints` is your own standing preference, read live, where it
 * used to be a countdown nobody set that expired after a game. `sunnyPlay` is
 * the forced play after a call lands on you, and `helpedTurn` is a single turn
 * bought out loud with `want help?`.
 *
 * An app that points at the answer never lets anyone be caught, which is why
 * turning this on is public (`SeatView.hinted`). **Presentation, never a rule**:
 * the engine does not learn it exists and no bot may read it.
 *
 * **The `sunnyPlay` source waits for the ruling to have been watched** (#382).
 * The phase moves the instant a call is judged correct, so the highlights came
 * up on the first frame of the peel — announcing the verdict, on every screen at
 * the table, 2.6 seconds before the announcement did, and on the offender's own
 * screen before they had been told they were caught. `judging` is the beat
 * itself, so a right call and a wrong one look identical for the whole of it.
 * The other two sources are deliberately untouched: help that was already on
 * stays on, and a highlight that does not change when the call lands is no tell.
 *
 * There is nothing to point at in the meantime either — the forced play cannot
 * be made until the dialog is dismissed, which is the same span for the one
 * person who has one.
 */
export const assisting = (
  game: GameView,
  hints: boolean,
  helpedTurn: number | null,
  /** The peel and the ruling, and for the offender their dialog on the end of
   * it: `judging` in `useTableState`. */
  judging = false,
): boolean =>
  (game.phase.kind === "sunnyPlay" && !judging) || hints || helpedTurn === game.turnNumber;

/**
 * The first branch is the one worth knowing about: the hand goes **dead** from
 * the moment a call lands on you until you dismiss the dialog. The tap that
 * would fire the forced play is very often the tail of the one that drew the
 * card you were caught for.
 */
export const handMode = (
  game: GameView,
  mine: boolean,
  caughtHold: boolean,
): HandMode => {
  if (caughtHold) return "idle";
  if (game.phase.kind === "surrender" && game.phase.playerId === game.you) return "surrender";
  if (mine && game.phase.kind === "sunnyPlay") return "forced";
  if (mine && game.phase.kind === "action") return "play";
  return "idle";
};
