/**
 * The one place that decides what a client is allowed to see. Nothing else may
 * send game state to a browser.
 *
 * Hands are not secret — every hand is face up — but two things must never leave
 * this file. `state.challenge` carries a full snapshot of the game and therefore
 * of every hand a moment ago; the one thing derived from it that does go out is
 * `sunnyReach`, and only to a viewer who could call. `state.sunny` names cards
 * still in the deck, and which cards are coming off the deck is not something
 * the table gets told in advance.
 *
 * A new field on `GameState` is invisible to clients until someone adds it here,
 * which is the intended default. `GameEvent`s need no redaction and go out
 * whole: every one describes something that already happened in the open.
 */

import { legalCards, mustPlay, playerById, sunnyLockedDraws, topCard } from "./rules.ts";
import type {
  Card,
  CardId,
  GameState,
  PlayerId,
  SunnyReach,
  SurrenderReason,
  Suit,
} from "./types.ts";

export interface PlayerView {
  id: PlayerId;
  cardCount: number;
  eliminated: boolean;
  /** Face up: everyone's hand, all the time. */
  hand: Card[];
}

export type PhaseView =
  | { kind: "action" }
  /** Whose call the suit is, which need not be whose turn it is. */
  | { kind: "suit"; playerId: PlayerId }
  | { kind: "sunnyPlay" }
  | { kind: "surrender"; playerId: PlayerId; reason: SurrenderReason }
  | { kind: "over" };

export interface GameView {
  /** Null for a table screen or a spectator, which hold no cards. */
  you: PlayerId | null;
  players: PlayerView[];
  turnPlayerId: PlayerId;
  waitingOn: PlayerId | null;
  phase: PhaseView;
  topCard: Card;
  activeSuit: Suit;
  /**
   * Public the moment it is chosen — naming a suit is done out loud. Here
   * because `activeSuit` cannot answer it: a name matching the 8's own suit is
   * indistinguishable from no name at all (#114).
   */
  namedSuit: Suit | null;
  drawPileSize: number;
  discardPileSize: number;
  drawsThisTurn: number;
  /**
   * Whether *you* could call this instant. True after any draw by someone else,
   * legal or not — offering the button only when a call would succeed would hand
   * over the answer.
   */
  sunnyCallable: boolean;
  sunnyTargetId: PlayerId | null;
  /**
   * The offender's hand and board as they stood before the draw. A call must name
   * a card from this, and it is the only material a viewer gets to work out
   * whether a card was legal — the server never says that part.
   *
   * Sent only to viewers who could call. The drawer never learns they've been
   * caught, and a spectator is told nothing either.
   */
  sunnyReach: SunnyReach | null;
  /** Draws left before *you* may call again. Visible only to the locked-out
   * player; nobody else at the table is told. */
  sunnyLockedDraws: number;
  /** Your own playable cards. Never computed for anyone else's hand. */
  legalCardIds: CardId[];
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
  if (phase.kind === "suit") return { kind: "suit", playerId: phase.playerId };
  return { kind: phase.kind };
};

/**
 * Usually the player to move, but a suit and a punishment card are owed by a
 * named player who may be sitting elsewhere — the next seat under Power of
 * Eights, the dealer under Dealer's Choice.
 */
const waitingOn = (state: GameState): PlayerId | null => {
  if (state.phase.kind === "over") return null;
  if (state.phase.kind === "surrender") return state.phase.playerId;
  if (state.phase.kind === "suit") return state.phase.playerId;
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
    namedSuit: state.namedSuit,
    drawPileSize: state.drawPile.length,
    discardPileSize: state.discardPile.length,
    drawsThisTurn: state.drawsThisTurn,
    sunnyCallable: canCall,
    sunnyTargetId: canCall ? challenge.drawerId : null,
    sunnyReach: canCall ? challenge.reach : null,
    sunnyLockedDraws: viewer ? sunnyLockedDraws(state, viewer.id) : 0,
    legalCardIds: viewer ? legalCards(state, viewer).map((c) => c.id) : [],
    youMustPlay: viewer ? mustPlay(state, viewer) : false,
    status: state.status,
    winnerId: state.winnerId,
    turnNumber: state.turnNumber,
  };
};
