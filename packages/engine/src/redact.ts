/**
 * The one place that decides what a client is allowed to see.
 *
 * Nothing else in the codebase may send game state to a browser. Hands are not
 * secret — every hand is face up, always — but two things must never leave this
 * file:
 *
 *   - `state.challenge` itself, which carries a full snapshot of the game and
 *     therefore of every hand as it stood a moment ago. One *derived* bit of it
 *     does go out — `sunnyWouldLand`, whether a call would land — and that is a
 *     deliberate decision recorded in `AGENTS.md`, not a hole. The object stays
 *     here regardless.
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
import type { Card, CardId, GameState, PlayerId, SurrenderReason, Suit } from "./types.ts";

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
   * Whether a call would actually land — the tell behind the sun icon's glow.
   *
   * This is the one thing about the challenge window that used to be kept back
   * on purpose, and shipping it was a deliberate design decision, not an
   * oversight: see the Sunny Rule section of `AGENTS.md`. The balance is in the
   * UI, where the glow takes ten seconds to become obvious, so a player who is
   * watching still beats one who isn't.
   *
   * Sent only to viewers who could call this instant. The drawer never learns
   * they've been caught, and a spectator — who can't call at all — is told
   * nothing either.
   */
  sunnyWouldLand: boolean;
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
  // `resume` is bookkeeping for the engine and means nothing at the table.
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
    sunnyWouldLand: canCall && challenge.violation !== null,
    legalCardIds: viewer ? legalCards(state, viewer).map((c) => c.id) : [],
    youMustPlay: viewer ? mustPlay(state, viewer) : false,
    status: state.status,
    winnerId: state.winnerId,
    turnNumber: state.turnNumber,
  };
};
