/**
 * The one place that decides what a client is allowed to see.
 *
 * Nothing else in the codebase may send game state to a browser. Two things in
 * particular must never leave this file:
 *
 *   - other players' hands, when the table is playing with hands down;
 *   - anything at all about `state.challenge`, which holds both the "was that
 *     draw legal?" answer and a full snapshot of the game — every hand included;
 *   - `state.sunny`, which names the cards a caught player is about to have
 *     turned up. Those are still in the deck, and which cards are coming off
 *     the deck is not something the table gets told in advance.
 *
 * A new field on `GameState` is invisible to clients until someone adds it
 * here, which is the intended default.
 */

import { legalCards, mustPlay, playerById, topCard } from "./rules.ts";
import type {
  Card,
  CardId,
  GameEvent,
  GameState,
  PlayerId,
  SurrenderReason,
  Suit,
} from "./types.ts";

export interface PlayerView {
  id: PlayerId;
  cardCount: number;
  eliminated: boolean;
  /** Your own hand always; everyone else's only when hands are up. */
  hand: Card[] | null;
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
  handsVisible: boolean;
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
  /** Your own playable cards. Never computed for anyone else's hand. */
  legalCardIds: CardId[];
  /** Whether you are currently forbidden from drawing. */
  youMustPlay: boolean;
  status: "playing" | "over";
  winnerId: PlayerId | null;
  turnNumber: number;
}

export interface RedactOptions {
  handsVisible: boolean;
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

export const redact = (
  state: GameState,
  viewerId: PlayerId | null,
  { handsVisible }: RedactOptions,
): GameView => {
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
    handsVisible,
    players: state.players.map((player) => ({
      id: player.id,
      cardCount: player.hand.length,
      eliminated: player.eliminated,
      hand: handsVisible || player.id === viewer?.id ? player.hand : null,
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
    legalCardIds: viewer ? legalCards(state, viewer).map((c) => c.id) : [],
    youMustPlay: viewer ? mustPlay(state, viewer) : false,
    status: state.status,
    winnerId: state.winnerId,
    turnNumber: state.turnNumber,
  };
};

/** A `drew` event with the card withheld from everyone but its owner. */
export type EventView =
  | Exclude<GameEvent, { type: "drew" }>
  | { type: "drew"; playerId: PlayerId; card: Card | null };

export const redactEvent = (
  event: GameEvent,
  viewerId: PlayerId | null,
  { handsVisible }: RedactOptions,
): EventView => {
  if (event.type !== "drew") return event;
  const visible = handsVisible || event.playerId === viewerId;
  return { type: "drew", playerId: event.playerId, card: visible ? event.card : null };
};

export const redactEvents = (
  events: readonly GameEvent[],
  viewerId: PlayerId | null,
  options: RedactOptions,
): EventView[] => events.map((event) => redactEvent(event, viewerId, options));
