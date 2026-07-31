export const SUITS = ["C", "D", "H", "S"] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;
export type Rank = (typeof RANKS)[number];

/** The wild rank. Playable on anything, and its holder can never legally draw. */
export const WILD_RANK: Rank = "8";

/** Most cards a player may draw in one turn. */
export const MAX_DRAWS_PER_TURN = 3;

export type CardId = string;
export type PlayerId = string;

export interface Card {
  /** Unique per physical card — there are two of every rank/suit in play. */
  readonly id: CardId;
  readonly rank: Rank;
  readonly suit: Suit;
}

export interface GameOptions {
  readonly deckCount: number;
  readonly startingHandSize: number;
}

export const DEFAULT_OPTIONS: GameOptions = {
  deckCount: 2,
  startingHandSize: 5,
};

export interface PlayerState {
  readonly id: PlayerId;
  hand: Card[];
  /** Out of cards, out of the game. Kept in the seating order for the log. */
  eliminated: boolean;
}

export type DisposalReason =
  /** Cards drawn illegally, returned to the disposal pile by a Sunny call. */
  | "sunnyDrawn"
  /** The extra card a caught player gives up. */
  | "sunnyPunishment"
  /** The card a wrong accusation costs its caller. */
  | "sunnyBadCall";

/**
 * What the game is waiting for. Anything other than `action` means one specific
 * player owes one specific decision before play continues.
 */
export type Phase =
  /** The player to move must play a card or draw one. */
  | { kind: "action" }
  /** They played an 8 and must name the suit. */
  | { kind: "suit" }
  /** A Sunny call landed: they must now make the play they skipped. */
  | { kind: "sunnyPlay" }
  /** Someone owes a card. `resume` is where play picks back up. */
  | { kind: "disposal"; playerId: PlayerId; reason: DisposalReason; resume: Phase }
  | { kind: "over" };

/**
 * The Sunny Rule challenge window.
 *
 * Opens on any draw and closes when the *next* player takes their first action,
 * so it can outlive the turn it belongs to — a call arriving after the turn
 * ended rewinds it. `violation` is populated only when the draw was actually
 * illegal, and it never leaves the server: `redact.ts` drops this whole object
 * and sends only whether a call is currently possible.
 */
export interface Challenge {
  drawerId: PlayerId;
  /** Every card drawn this turn, in order. */
  drawnIds: CardId[];
  violation: {
    /**
     * The game exactly as it stood *before* the illegal draw. A successful call
     * restores this, which is what lets the punishment undo a turn the drawer
     * has already played on — including a wild 8 and the suit it named.
     */
    snapshot: GameState;
    /** Cards drawn from the illegal draw onward. All of them are disposed. */
    cardIds: CardId[];
  } | null;
  /** Only the first call is judged; the rest are too late. */
  resolved: boolean;
}

export interface GameState {
  options: GameOptions;
  players: PlayerState[];
  /** Index into `players` of whoever is to move. */
  turnIndex: number;
  drawPile: Card[];
  /** Top of the pile is the last element. */
  discardPile: Card[];
  /** Out of play until the draw pile runs dry and everything is recycled. */
  disposalPile: Card[];
  /**
   * The suit that must be matched. Usually the top card's suit, but after a
   * wild 8 it is whatever the player named, and it overrides the 8's own suit.
   */
  activeSuit: Suit;
  phase: Phase;
  challenge: Challenge | null;
  drawsThisTurn: number;
  rngSeed: number;
  status: "playing" | "over";
  winnerId: PlayerId | null;
  /** Increments on every turn change; useful for logs and for the UI. */
  turnNumber: number;
}

export type Intent =
  | { type: "playCard"; playerId: PlayerId; cardId: CardId }
  | { type: "drawCard"; playerId: PlayerId }
  | { type: "chooseSuit"; playerId: PlayerId; suit: Suit }
  | { type: "callSunny"; playerId: PlayerId }
  | { type: "disposeCard"; playerId: PlayerId; cardId: CardId };

export type GameEvent =
  | { type: "gameStarted"; upcard: Card }
  | { type: "played"; playerId: PlayerId; card: Card }
  | { type: "suitChosen"; playerId: PlayerId; suit: Suit }
  | { type: "drew"; playerId: PlayerId; card: Card }
  | { type: "reshuffled"; drawPileSize: number }
  | { type: "sunnyCalled"; callerId: PlayerId; targetId: PlayerId; correct: boolean }
  | { type: "disposed"; playerId: PlayerId; cards: Card[]; reason: DisposalReason }
  | { type: "eliminated"; playerId: PlayerId }
  | { type: "turnChanged"; playerId: PlayerId }
  | { type: "gameOver"; winnerId: PlayerId | null; reason: "lastStanding" | "stalemate" };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
