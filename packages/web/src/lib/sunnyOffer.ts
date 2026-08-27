/**
 * The two halves of a Sunny call as one screen sees it: the window to make one,
 * and the dialog for having one land on you. Five booleans, scattered across two
 * hundred lines of `Table.tsx` and none of them tested (#225).
 *
 * **Nothing in here knows whether a call would land.** `sunnyCallable` is true
 * after *any* draw by somebody else: offering the button only when a call would
 * succeed would hand over the answer, which is the tell #50 removed.
 */

import type { Card, GameView, PlayerId, SunnyOffence } from "@goleta/engine";

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

/**
 * Whether the accusation picker is actually up: the window still open on the
 * seat you tapped, and evidence to draw in it.
 *
 * It exists because **the log is concealed for exactly as long as this is true**
 * (#319). The upright table draws every event in the game in words at the foot
 * of the column, most recent first, so a caller who cannot remember what has
 * landed on the pile since the reach could otherwise scroll until they found it
 * — which would leave #318 as a change of typography rather than of difficulty.
 * One predicate rather than two conditions that have to agree: the picker and
 * the concealment are the same moment, and a screen deciding it twice is a
 * screen that can get it half right.
 *
 * The limit is honest and deliberate: back out of the picker and the log is
 * there again. Concealing it for the whole window a call could be made would
 * conceal it for most of most games, because a window opens on every draw.
 */
export const accusePickerOpen = (game: GameView, accusing: string | null): boolean =>
  accusing !== null && stillAccusable(game, accusing) && game.sunnyReach !== null;

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

/**
 * What the offender's dialog says about the offence and about its third step.
 *
 * It is here rather than as ternaries inside `SunnyCaught.tsx` because nothing
 * in this repo renders a React component in a test, so a decision left in a
 * screen is a decision nothing checks — and this one had been wrong in two
 * places at once since #260 (#363). The dialog was written for one offence when
 * there are two: a player who drew three times legally, was handed a play by the
 * third card, pressed **I'm done** and got called on it was told that they drew
 * when they didn't, and that they had reached for an empty deck when the deck
 * was full.
 *
 * **The offence is read, never inferred.** `sunnyCalled.via` carries it, and the
 * near-miss that produced the wrong sentence — nothing returned plus a deck that
 * is not empty — is *almost* the press: `turnDrawnOut` is also true when the deck
 * cannot be refilled, so a player can press the button holding a play having
 * drawn nothing, with the deck empty, and the inference then accuses them of
 * drawing illegally.
 *
 * **It does not relax #260.** Nothing on any screen may separate an honest end
 * from a dishonest one *before* a call. This is drawn after one has landed, to
 * the offender alone, about an offence the whole table has already been told
 * about — the one place the distinction may appear.
 *
 * And it still gives nothing away: the play named is one they have already been
 * caught not making, and nothing here says anything about whether a call would
 * land.
 */
export type CaughtStep3 =
  /**
   * Cards were drawn illegally: they go back face up on top of the pile, and the
   * **last of them** is the card everybody matches next. The others are simply
   * gone — `finishSunny` calls `turnUp`, which does `s.activeSuit = last.suit`
   * and nothing with the rest.
   *
   * `board` is the fourth thing decided here rather than in the dialog (#381),
   * which said "that's what everyone matches next" about all three at once and
   * left the offender to guess, with two answers in three wrong. `returned`
   * arrives in draw order, because `findCards` maps over `touchedIds`, so the
   * answer is its last card and not its first.
   */
  | { kind: "returned"; cards: Card[]; board: Card }
  /** Nothing to take back and no deck either, so the pile is shuffled back and a
   * fresh card turned up. Not "nothing to turn up", which is what it used to say
   * — `finishSunny` calls `recycleFaceUpPile`, and that *does* turn one up. */
  | { kind: "recycled" }
  /** The press, with a deck still in front of them: nothing is turned up at all,
   * so the only true thing left to say is who is up next. */
  | { kind: "resumes"; playerId: PlayerId }
  /** The same, but with no next turn that can honestly be named — the forced play
   * is their last card, so they are out and the game may be over with it. Say
   * something true or say nothing (#363). */
  | { kind: "nothing" };

export interface CaughtNarration {
  /** How the line under the heading describes what they did. */
  offence: SunnyOffence;
  step3: CaughtStep3;
}

export const caughtNarration = (
  call: SunnyCalled,
  game: GameView,
  /** False when the skipped play is their last card, which is also what step 2
   * is drawn on: it eliminates them on the spot. */
  owesPunishment: boolean,
): CaughtNarration => ({
  // A ruling from a server that has not learned to say which offence it was
  // describes the original one, which is what every such ruling was.
  offence: call.via ?? "draw",
  step3: thirdStep(call, game, owesPunishment),
});

const thirdStep = (call: SunnyCalled, game: GameView, owesPunishment: boolean): CaughtStep3 => {
  // The last card back is the one that ends up in play, and asking for it this
  // way is also the check that there was one: an empty list has no board.
  const board = call.returned.at(-1);
  if (board) return { kind: "returned", cards: call.returned, board };
  if (game.drawPileSize === 0) return { kind: "recycled" };
  return owesPunishment
    ? { kind: "resumes", playerId: nextUp(game, call.targetId) }
    : { kind: "nothing" };
};

/** The seat up once the penalty is paid: the offender's left, eliminated seats
 * skipped. `players` is in seat order, which is turn order. */
const nextUp = (game: GameView, offenderId: PlayerId): PlayerId => {
  const seats = game.players;
  const at = seats.findIndex((player) => player.id === offenderId);
  for (let step = 1; step <= seats.length; step += 1) {
    const seat = seats[(at + step) % seats.length];
    if (seat && !seat.eliminated && seat.id !== offenderId) return seat.id;
  }
  return offenderId;
};
