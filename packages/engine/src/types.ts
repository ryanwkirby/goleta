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

/**
 * The wild rank — but only when played from a hand. An 8 turned up off the deck
 * is *natural*: it plays as an ordinary card of its own suit. See `isWild`.
 */
export const WILD_RANK: Rank = "8";

/** Most cards a player may draw in one turn. */
export const MAX_DRAWS_PER_TURN = 3;

export type CardId = string;
export type PlayerId = string;

export interface Card {
  /** Unique per physical card, so a specific one can be moved. */
  readonly id: CardId;
  readonly rank: Rank;
  readonly suit: Suit;
}

export interface GameOptions {
  readonly deckCount: number;
  readonly startingHandSize: number;
}

export const DEFAULT_OPTIONS: GameOptions = {
  deckCount: 1,
  startingHandSize: 3,
};

export interface PlayerState {
  readonly id: PlayerId;
  hand: Card[];
  /** Out of cards, out of the game. Kept in the seating order for the log. */
  eliminated: boolean;
}

export type SurrenderReason =
  /** The extra card a caught player gives up. Played on top of the pile. */
  | "sunnyPunishment"
  /** The card a wrong accusation costs its caller. Buried at the bottom. */
  | "sunnyBadCall";

/**
 * What the game is waiting for. Anything other than `action` means one specific
 * player owes one specific decision before play continues.
 */
export type Phase =
  /** The player to move must play a card or draw one. */
  | { kind: "action" }
  /** They played an 8 from hand and must name the suit. */
  | { kind: "suit" }
  /** A Sunny call landed: they must now make the play they skipped. */
  | { kind: "sunnyPlay" }
  /**
   * Someone owes a card of their choosing, legality irrelevant. `resume` is
   * where play picks back up, and is only meaningful for a bad call — a
   * punishment is always followed by the rest of the Sunny resolution.
   */
  | { kind: "surrender"; playerId: PlayerId; reason: SurrenderReason; resume: Phase }
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
    /**
     * Cards drawn from the illegal draw onward — the ones they "touched". All
     * of them are turned face up at the end of the resolution.
     */
    touchedIds: CardId[];
  } | null;
  /** Only the first call is judged; the rest are too late. */
  resolved: boolean;
}

/**
 * A Sunny call that landed and is still being paid off. Set the moment a
 * correct call rewinds the game, cleared when the touched cards are turned up.
 *
 * It exists because the resolution spans several intents — the skipped play,
 * then the punishment card — and the cards to turn up at the end have to
 * survive both. `redact.ts` drops it: which cards are about to come off the
 * deck is not something the table gets told early.
 */
export interface SunnyResolution {
  offenderId: PlayerId;
  /** Turned face up once the punishment is paid; the last lands on top. */
  touchedIds: CardId[];
}

export interface GameState {
  options: GameOptions;
  players: PlayerState[];
  /** Index into `players` of whoever is to move. */
  turnIndex: number;
  drawPile: Card[];
  /**
   * The one face-up pile. Top of the pile is the last element, and the whole
   * thing — top card included — is recycled when the deck runs out.
   */
  discardPile: Card[];
  /**
   * The suit that must be matched. Usually the top card's suit, but after a
   * wild 8 played from a hand it is whatever the player named, and it overrides
   * the 8's own suit.
   */
  activeSuit: Suit;
  phase: Phase;
  challenge: Challenge | null;
  /** Non-null only while a landed Sunny call is being paid off. */
  sunny: SunnyResolution | null;
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
  | { type: "surrenderCard"; playerId: PlayerId; cardId: CardId };

/** Why a card came off the deck rather than out of a hand. */
export type TurnUpReason = "recycle" | "sunnyTouched";

export type GameEvent =
  | { type: "gameStarted"; upcard: Card }
  | { type: "played"; playerId: PlayerId; card: Card }
  | { type: "suitChosen"; playerId: PlayerId; suit: Suit }
  | { type: "drew"; playerId: PlayerId; card: Card }
  | { type: "reshuffled"; drawPileSize: number }
  /** A card turned face up off the deck. Always natural, never wild. */
  | { type: "turnedUp"; cards: Card[]; reason: TurnUpReason }
  /**
   * `returned` are the cards the rewind takes back off the offender and puts
   * on the deck — empty for a call that missed, and for a reach at an empty
   * deck that brought nothing back.
   *
   * They are safe to broadcast even though `state.sunny` is not. Every one of
   * them was drawn face up, in front of everybody, and announced by its own
   * `drew` event; the rewind is the table watching that undone, not a peek at
   * what the deck is holding.
   */
  | {
      type: "sunnyCalled";
      callerId: PlayerId;
      targetId: PlayerId;
      correct: boolean;
      returned: Card[];
    }
  | { type: "surrendered"; playerId: PlayerId; card: Card; reason: SurrenderReason }
  | { type: "eliminated"; playerId: PlayerId }
  | { type: "turnChanged"; playerId: PlayerId }
  | { type: "gameOver"; winnerId: PlayerId | null; reason: "lastStanding" | "stalemate" };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
