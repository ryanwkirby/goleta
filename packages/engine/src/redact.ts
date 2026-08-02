/**
 * The one place that decides what a client is allowed to see.
 *
 * Nothing else in the codebase may send game state to a browser. Hands are not
 * secret — every hand is face up, always — but two things must never leave this
 * file:
 *
 *   - `state.challenge` itself, which carries a full snapshot of the game and
 *     therefore of every hand as it stood a moment ago. One thing derived from
 *     it does go out, to whoever is eligible to call: `sunnyReach`, the
 *     offender's pre-draw hand and the board they faced at that moment. It
 *     doesn't say which of those cards was legal — that is for the viewer to
 *     work out, same as it always was. The object itself, and in particular
 *     `violation`, stays here regardless: nothing ever says whether a call
 *     *would* land.
 *   - `state.sunny`, which names the cards a caught player is about to have
 *     turned up. Those are still in the deck, and which cards are coming off
 *     the deck is not something the table gets told in advance.
 *
 * A new field on `GameState` is invisible to clients until someone adds it
 * here, which is the intended default.
 *
 * `GameEvent`s need no redaction and are broadcast whole: every one of them
 * describes something that has already happened in the open. A new event that
 * would not be is a bug in the event, not something to filter on the way out.
 */

import { legalCards, mustPlay, playerById, topCard } from "./rules.ts";
import type { Card, CardId, GameState, PlayerId, Rank, SurrenderReason, Suit } from "./types.ts";

export interface PlayerView {
  id: PlayerId;
  cardCount: number;
  eliminated: boolean;
  /** Face up: everyone's hand, all the time. */
  hand: Card[];
}

export type PhaseView =
  | { kind: "action" }
  | { kind: "suit" }
  | { kind: "sunnyPlay" }
  | { kind: "surrender"; playerId: PlayerId; reason: SurrenderReason }
  | { kind: "over" };

export interface GameView {
  /** Null for a table screen or a spectator, which hold no cards. */
  you: PlayerId | null;
  players: PlayerView[];
  turnPlayerId: PlayerId;
  /** Whoever the game is waiting on — usually, but not always, the turn. */
  waitingOn: PlayerId | null;
  phase: PhaseView;
  topCard: Card;
  activeSuit: Suit;
  drawPileSize: number;
  discardPileSize: number;
  drawsThisTurn: number;
  /**
   * Whether *you* could call the Sunny Rule this instant. True after any draw
   * by someone else, whether or not that draw was legal — offering the button
   * only when a call would succeed would hand over the answer.
   */
  sunnyCallable: boolean;
  sunnyTargetId: PlayerId | null;
  /**
   * The offender's hand and the board they faced, exactly as they stood before
   * the draw a call would be judged against. This is what a call must name a
   * card from — nothing they drew afterwards is ever offered — and it is the
   * only material a viewer gets to work out whether a card was actually legal.
   * The server never says that part; it only ever hands over what was already
   * public a moment ago.
   *
   * Sent only to viewers who could call this instant. The drawer never learns
   * they've been caught, and a spectator — who can't call at all — is told
   * nothing either.
   */
  sunnyReach: { hand: Card[]; activeSuit: Suit; topRank: Rank } | null;
  /**
   * Draws left before *you* may call again, after a wrong accusation. Zero
   * means free to call. Visible only to the locked-out player themselves —
   * nobody else at the table is told.
   */
  sunnyLockedDraws: number;
  /** Your own playable cards. Never computed for anyone else's hand. */
  legalCardIds: CardId[];
  /** Whether you are currently forbidden from drawing. */
  youMustPlay: boolean;
  status: "playing" | "over";
  winnerId: PlayerId | null;
  turnNumber: number;
}

const phaseView = (state: GameState): PhaseView => {
  const phase = state.phase;
  if (phase.kind === "surrender") {
    return { kind: "surrender", playerId: phase.playerId, reason: phase.reason };
  }
  return { kind: phase.kind };
};

const waitingOn = (state: GameState): PlayerId | null => {
  if (state.phase.kind === "over") return null;
  if (state.phase.kind === "surrender") return state.phase.playerId;
  return state.players[state.turnIndex]?.id ?? null;
};

export const redact = (state: GameState, viewerId: PlayerId | null): GameView => {
  const viewer = viewerId === null ? undefined : playerById(state, viewerId);
  const challenge = state.challenge;
  const canCall =
    challenge !== null &&
    !challenge.resolved &&
    viewer !== undefined &&
    !viewer.eliminated &&
    challenge.drawerId !== viewer.id &&
    state.status === "playing";

  return {
    you: viewer?.id ?? null,
    players: state.players.map((player) => ({
      id: player.id,
      cardCount: player.hand.length,
      eliminated: player.eliminated,
      hand: player.hand,
    })),
    turnPlayerId: state.players[state.turnIndex]?.id ?? "",
    waitingOn: waitingOn(state),
    phase: phaseView(state),
    topCard: topCard(state),
    activeSuit: state.activeSuit,
    drawPileSize: state.drawPile.length,
    discardPileSize: state.discardPile.length,
    drawsThisTurn: state.drawsThisTurn,
    sunnyCallable: canCall,
    sunnyTargetId: canCall ? challenge.drawerId : null,
    sunnyReach: canCall ? challenge.reach : null,
    sunnyLockedDraws: viewer
      ? Math.max(0, (state.sunnyLockouts[viewer.id] ?? 0) - state.totalDraws)
      : 0,
    legalCardIds: viewer ? legalCards(state, viewer).map((c) => c.id) : [],
    youMustPlay: viewer ? mustPlay(state, viewer) : false,
    status: state.status,
    winnerId: state.winnerId,
    turnNumber: state.turnNumber,
  };
};
