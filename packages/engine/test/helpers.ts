import {
  DEFAULT_OPTIONS,
  applyIntent,
  type ApplyResult,
  type Card,
  type GameState,
  type Intent,
  type PlayerId,
  type Rank,
  type Suit,
} from "../src/index.ts";

/**
 * `card("8H")` or `card("10S#2")` for the second copy. Tests read as hands of
 * cards rather than as object literals.
 */
export const card = (spec: string): Card => {
  const [face = "", copy = "1"] = spec.split("#");
  const suit = face.slice(-1) as Suit;
  const rank = face.slice(0, -1) as Rank;
  return { id: `${rank}${suit}#${copy}`, rank, suit };
};

export const cards = (...specs: string[]): Card[] => specs.map(card);

export interface TableSpec {
  /** Seating order is the order of the keys. */
  hands: Record<PlayerId, string[]>;
  /** Top of the discard pile. */
  top: string;
  /** Defaults to the top card's suit, as it would be outside a wild. */
  activeSuit?: Suit;
  drawPile?: string[];
  /** Cards under the top of the face-up pile, for recycle tests. */
  buriedDiscards?: string[];
  turn?: PlayerId;
  /** Players already out of the game. */
  out?: PlayerId[];
}

/**
 * Builds an exact position. Deliberately not a real deal — every rule test
 * wants one specific arrangement, and randomness would only obscure it.
 */
export const table = (spec: TableSpec): GameState => {
  const players = Object.entries(spec.hands).map(([id, specs]) => ({
    id,
    hand: cards(...specs),
    eliminated: spec.out?.includes(id) ?? false,
  }));
  const top = card(spec.top);
  const turnIndex = spec.turn ? players.findIndex((p) => p.id === spec.turn) : 0;
  if (turnIndex < 0) throw new Error(`no player named ${spec.turn}`);

  return {
    options: DEFAULT_OPTIONS,
    players,
    turnIndex,
    drawPile: cards(...(spec.drawPile ?? [])),
    discardPile: [...cards(...(spec.buriedDiscards ?? [])), top],
    activeSuit: spec.activeSuit ?? top.suit,
    phase: { kind: "action" },
    challenge: null,
    sunny: null,
    drawsThisTurn: 0,
    rngSeed: 12345,
    status: "playing",
    winnerId: null,
    turnNumber: 1,
  };
};

/** Applies an intent and fails loudly if the engine rejected it. */
export const must = (state: GameState, intent: Intent): GameState => {
  const result = applyIntent(state, intent);
  if (!result.ok) throw new Error(`engine rejected ${intent.type}: ${result.error}`);
  return result.state;
};

export const reject = (state: GameState, intent: Intent): string => {
  const result: ApplyResult = applyIntent(state, intent);
  if (result.ok) throw new Error(`engine allowed ${intent.type} but shouldn't have`);
  return result.error;
};

export const play = (state: GameState, playerId: PlayerId, spec: string): GameState =>
  must(state, { type: "playCard", playerId, cardId: card(spec).id });

export const draw = (state: GameState, playerId: PlayerId): GameState =>
  must(state, { type: "drawCard", playerId });

export const surrender = (state: GameState, playerId: PlayerId, spec: string): GameState =>
  must(state, { type: "surrenderCard", playerId, cardId: card(spec).id });

export const handOf = (state: GameState, id: PlayerId): string[] =>
  (state.players.find((p) => p.id === id)?.hand ?? []).map((c) => c.id);

/** Every card in the game, wherever it is. The count must never change. */
export const allCardIds = (state: GameState): string[] => [
  ...state.players.flatMap((p) => p.hand.map((c) => c.id)),
  ...state.drawPile.map((c) => c.id),
  ...state.discardPile.map((c) => c.id),
];

/** The face-up pile from the top down, which is how the tests talk about it. */
export const pileFromTop = (state: GameState): string[] =>
  state.discardPile.map((c) => c.id).toReversed();
