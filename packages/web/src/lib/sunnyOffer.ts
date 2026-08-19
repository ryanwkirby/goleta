/**
 * The two halves of a Sunny call as one screen sees it: the window to make one,
 * and the dialog for having one land on you.
 *
 * Five booleans, scattered across two hundred lines of `Table.tsx` and none of
 * them tested (#225). They decide the most consequential moment in the game —
 * whether you are offered the chance to accuse somebody, and whether you are
 * being walked through having been caught — so they are worth stating in one
 * place and holding to a test.
 *
 * **Nothing in here knows whether a call would land.** `sunnyCallable` is true
 * after *any* draw by somebody else, legal or not: offering the button only
 * when a call would succeed would hand over the answer, which is the tell #50
 * removed. The server decides who may call; this only decides what is drawn.
 */

import type { GameView } from "@goleta/engine";

import type { SunnyCalled } from "./judgedCall.ts";

/**
 * Whose reach is on offer, if anybody's — the one seat a call could be made
 * about right now.
 *
 * `sunnyCallable` is false for a watcher, for the drawer themselves and for
 * anybody eliminated, so this is already only ever a seat that may act on it
 * (`redact.ts`). Null while the picker is open: the picker *is* the call being
 * composed, and an offer to start one over the top of it is an offer to do the
 * thing you are already doing.
 */
export const sunnyTarget = (game: GameView, accusing: string | null): string | null =>
  game.sunnyCallable && accusing === null ? game.sunnyTargetId : null;

/**
 * Whether the accusation being composed is still one that can be made.
 *
 * Somebody else may act — or call it first — while you are still choosing. The
 * picker goes with the window rather than sitting there offering a card you can
 * no longer name.
 */
export const stillAccusable = (game: GameView, accusing: string | null): boolean =>
  game.sunnyCallable && game.sunnyTargetId === accusing;

export interface CaughtState {
  /** A call landed, it was right, and you are the one it was about. */
  caughtYou: boolean;
  /**
   * The screen belongs to the ruling: the peel is running, or the dialog is up
   * and unacknowledged. The hand is dead for this whole span.
   */
  caughtHold: boolean;
  /** The evidence has been watched; the dialog itself is up. */
  showCaught: boolean;
}

/**
 * The seat a landed call is about gets a dialog instead of the banner.
 *
 * A timed notice at the top of the screen is the right weight for news about
 * somebody else and much too light for a punishment you are about to be walked
 * through — see #66.
 *
 * It waits for the peel like the banner does: being shown the evidence and then
 * told what it meant is the order for the offender too, and they of all people
 * are owed a look at why.
 */
export const caughtState = (
  call: SunnyCalled | null,
  /** The log id of that call, so a new call restarts the beat. */
  lastCallId: number | undefined,
  /** The call this screen has already dismissed the dialog for. */
  ackedCall: number | null,
  peeling: boolean,
  you: string | null,
): CaughtState => {
  const caughtYou = call !== null && call.correct && call.targetId === you;
  const caughtHold = caughtYou && (peeling || ackedCall !== lastCallId);
  return { caughtYou, caughtHold, showCaught: caughtHold && !peeling };
};
