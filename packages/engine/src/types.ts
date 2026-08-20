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

/** Wild only when played from a hand; an 8 turned up off the deck is natural. */
export const WILD_RANK: Rank = "8";

/** Most cards a player may draw in one turn. */
export const MAX_DRAWS_PER_TURN = 3;

/** Draws a wrong caller must sit out before they may call again. */
export const SUNNY_LOCKOUT_DRAWS = 3;

export type CardId = string;
export type PlayerId = string;

export interface Card {
  readonly id: CardId;
  readonly rank: Rank;
  readonly suit: Suit;
}

/**
 * Who names the suit after an 8 played from a hand. `nextPlayerNames` is the
 * **Power of Eights** alternate: the turn still passes to the next player, who
 * then has to follow the suit they just named.
 */
export type EightsRule = "playerNames" | "nextPlayerNames";

/**
 * What an 8 turned up as the very first card means. `dealerNames` is the
 * **Dealer's Choice** alternate, and the one advantage dealing carries.
 */
export type SeedEightRule = "natural" | "dealerNames";

/** The Sunny Rule's settings, or `null` at a table that plays without it — no
 * challenge window, and no per-draw snapshot taken. */
export interface SunnyRule {
  readonly lockoutDraws: number;
}

/**
 * The house rules for one game. Data only, never functions: this is cloned on
 * every intent, cloned again into `Challenge.violation.snapshot`, and put
 * through `JSON.stringify` by `persist.ts`. Behaviour that varies is looked up
 * from these values, not stored in them.
 */
export interface GameOptions {
  readonly deckCount: number;
  readonly startingHandSize: number;
  readonly eights: EightsRule;
  readonly seedEight: SeedEightRule;
  readonly sunny: SunnyRule | null;
}

/** The game as written. Every alternate rule is off. */
export const DEFAULT_OPTIONS: GameOptions = {
  deckCount: 1,
  startingHandSize: 3,
  eights: "playerNames",
  seedEight: "natural",
  sunny: { lockoutDraws: SUNNY_LOCKOUT_DRAWS },
};

export interface PlayerState {
  readonly id: PlayerId;
  hand: Card[];
  /** Out of cards, out of the game. Kept in seating order for the log. */
  eliminated: boolean;
}

export type SurrenderReason =
  /** The extra card a caught player gives up, played on top of the pile. */
  "sunnyPunishment";

/**
 * What the game is waiting for. Anything but `action` means one player owes one
 * decision before play continues.
 */
export type Phase =
  | { kind: "action" }
  /**
   * A suit is owed. `playerId` is not always the player to move: under Power of
   * Eights it is the next seat, under Dealer's Choice the dealer. Naming always
   * advances the turn afterwards, which is what makes one rule cover all three.
   */
  | { kind: "suit"; playerId: PlayerId }
  /** A Sunny call landed: they must now make the play they skipped. */
  | { kind: "sunnyPlay" }
  /** They were caught and owe the punishment card: any one, legality irrelevant. */
  | { kind: "surrender"; playerId: PlayerId; reason: SurrenderReason }
  | { kind: "over" };

/**
 * The position a challenged reach was made from, frozen at the instant *before*
 * the deck was touched. Named because it is the shape of the accusation on both
 * sides of the wire — `Challenge.reach` here, `GameView.sunnyReach` at the table.
 */
export interface SunnyReach {
  hand: Card[];
  activeSuit: Suit;
  topRank: Rank;
}

/**
 * The pile as the reach left it — what a judged call peels back to show. Derived
 * on the way out, never stored. `activeSuit` has to be here: a wild 8 overrides
 * the suit you can see.
 */
export interface SunnyEvidence {
  inPlay: Card;
  /** The suit that had to be matched then, which `inPlay` alone may not say. */
  activeSuit: Suit;
  /** What reached the pile after the offence, oldest first. Usually none. */
  since: Card[];
}

/**
 * The face-up pile at the instant a `SunnyReach` describes. Kept off that shape
 * deliberately: `SunnyReach` crosses the wire before any verdict exists.
 */
export interface ReachPile {
  inPlay: Card;
  /** Cards already in the pile, so what came later can be told apart. */
  ids: CardId[];
}

/**
 * The Sunny Rule challenge window. Opens on any draw and closes when the next
 * player acts, so it can outlive its turn — a late call rewinds it. `violation`
 * is set only when the draw was actually illegal, and `redact.ts` drops this
 * whole object: a client learns only that a call is possible.
 */
export interface Challenge {
  drawerId: PlayerId;
  /** Every card drawn this turn, in order. */
  drawnIds: CardId[];
  /**
   * The hand and board as they stood immediately before the reach. A card the
   * offender only came to hold afterwards is never offered and never counts.
   */
  reach: SunnyReach;
  /** The pile frozen at the same instant as `reach`, and by the same rule. */
  reachPile: ReachPile;
  violation: {
    /**
     * The game as it stood *before* the illegal draw. A landed call restores it,
     * which is what lets the punishment undo a turn already played on.
     */
    snapshot: GameState;
    /** Cards drawn from the illegal draw onward, all turned face up at the end. */
    touchedIds: CardId[];
  } | null;
  /** Only the first call is judged; the rest are too late. */
  resolved: boolean;
}

/**
 * A landed call still being paid off. The resolution spans several intents — the
 * skipped play, then the punishment — and the cards to turn up have to survive
 * both. Dropped by `redact.ts`.
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
  /** The one face-up pile, top last. Recycled whole when the deck runs out. */
  discardPile: Card[];
  /**
   * The suit that must be matched — usually the top card's, but a wild 8 played
   * from a hand overrides it with whatever was named.
   */
  activeSuit: Suit;
  /**
   * The suit somebody *named* for the card in play, or null when nobody did.
   *
   * No rule reads it: `activeSuit` is still the suit to match. This records only
   * that a choice happened, which is not recoverable afterwards — naming the 8's
   * own suit leaves a state identical to a natural 8 (#114). Set by `chooseSuit`,
   * cleared wherever the card in play changes.
   */
  namedSuit: Suit | null;
  phase: Phase;
  challenge: Challenge | null;
  /** Non-null only while a landed Sunny call is being paid off. */
  sunny: SunnyResolution | null;
  drawsThisTurn: number;
  /**
   * Reaches for the deck across the whole game, never reset. Lockouts count
   * against this rather than turns, so they run down at the same rate however
   * draws fall within a turn.
   */
  totalDraws: number;
  /**
   * Per caller, the `totalDraws` value at which their lockout from a wrong
   * accusation lifts. Absent or at-or-below `totalDraws` means free to call.
   */
  sunnyLockouts: Record<PlayerId, number>;
  rngSeed: number;
  status: "playing" | "over";
  winnerId: PlayerId | null;
  /** Increments on every turn change. */
  turnNumber: number;
}

export type Intent =
  | { type: "playCard"; playerId: PlayerId; cardId: CardId }
  | { type: "drawCard"; playerId: PlayerId }
  | { type: "chooseSuit"; playerId: PlayerId; suit: Suit }
  /** `cardId` is the accused card from the offender's pre-draw hand. */
  | { type: "callSunny"; playerId: PlayerId; cardId: CardId }
  | { type: "surrenderCard"; playerId: PlayerId; cardId: CardId };

/** Why a card came off the deck rather than out of a hand. */
export type TurnUpReason = "recycle" | "sunnyTouched";

export type GameEvent =
  /** `seatsShuffled` says this deal reordered the table (#199) — a `rooms.ts`
   * decision the engine neither makes nor reads. */
  | { type: "gameStarted"; upcard: Card; seatsShuffled: boolean }
  | { type: "played"; playerId: PlayerId; card: Card }
  | { type: "suitChosen"; playerId: PlayerId; suit: Suit }
  | { type: "drew"; playerId: PlayerId; card: Card }
  | { type: "reshuffled"; drawPileSize: number }
  /** A card turned face up off the deck. Always natural, never wild. */
  | { type: "turnedUp"; cards: Card[]; reason: TurnUpReason }
  /**
   * `card` is the card the caller named, public because the accusation is said
   * out loud. `returned` are the cards the rewind takes back off the offender;
   * they are safe to broadcast even though `state.sunny` is not, since every one
   * was drawn face up and announced by its own `drew`. `evidence` goes to the
   * whole table, offender included — once judged, the ruling and what it was
   * judged on are both public.
   */
  | {
      type: "sunnyCalled";
      callerId: PlayerId;
      targetId: PlayerId;
      card: Card;
      correct: boolean;
      returned: Card[];
      evidence: SunnyEvidence;
    }
  | { type: "surrendered"; playerId: PlayerId; card: Card; reason: SurrenderReason }
  | { type: "eliminated"; playerId: PlayerId }
  | { type: "turnChanged"; playerId: PlayerId }
  | { type: "gameOver"; winnerId: PlayerId | null; reason: "lastStanding" | "stalemate" };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
