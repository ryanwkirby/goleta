/**
 * The two halves of a Sunny call as one screen sees it: the window to make one,
 * and the dialog for having one land on you. Five booleans, scattered across two
 * hundred lines of `Table.tsx` and none of them tested (#225).
 *
 * **Nothing in here knows whether a call would land.** `sunnyCallable` is true
 * after *any* draw by somebody else: offering the button only when a call would
 * succeed would hand over the answer, which is the tell #50 removed.
 */

import type { GameView } from "@goleta/engine";

import type { SunnyCalled } from "./judgedCall.ts";

/**
 * Whose reach is on offer, if anybody's. `sunnyCallable` is already false for a
 * watcher, the drawer and anybody eliminated (`redact.ts`). Null while the
 * picker is open: the picker *is* the call being composed.
 */
export const sunnyTarget = (game: GameView, accusing: string | null): string | null =>
  game.sunnyCallable && accusing === null ? game.sunnyTargetId : null;

/** Somebody else may act, or call it first, while you are still choosing. The
 * picker goes with the window rather than offering a card you can no longer
 * name. */
export const stillAccusable = (game: GameView, accusing: string | null): boolean =>
  game.sunnyCallable && game.sunnyTargetId === accusing;

export interface CaughtState {
  caughtYou: boolean;
  caughtHold: boolean;
  showCaught: boolean;
}

/**
 * The seat a landed call is about gets a dialog instead of the banner: a timed
 * notice is the right weight for news about somebody else and far too light for
 * a punishment you are about to be walked through (#66). It waits for the peel,
 * because the offender is owed a look at why too.
 */
export const caughtState = (
  call: SunnyCalled | null,
  lastCallId: number | undefined,
  ackedCall: number | null,
  peeling: boolean,
  you: string | null,
): CaughtState => {
  const caughtYou = call !== null && call.correct && call.targetId === you;
  const caughtHold = caughtYou && (peeling || ackedCall !== lastCallId);
  return { caughtYou, caughtHold, showCaught: caughtHold && !peeling };
};
