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

/** Draws a wrong caller must sit out before they may call again. */
export const SUNNY_LOCKOUT_DRAWS = 3;

export type CardId = string;
export type PlayerId = string;

export interface Card {
  /** Unique per physical card, so a specific one can be moved. */
  readonly id: CardId;
  readonly rank: Rank;
  readonly suit: Suit;
}

/**
 * Who names the suit after an 8 is played from a hand.
 *
 * `nextPlayerNames` is the **Power of Eights** alternate rule. It only swaps
 * the chooser — the turn still passes to the next player, who then plays
 * against the suit they just named. That makes an 8 a pure liability: the
 * player you hand it to will name a suit they can't follow, and get a free
 * draw out of you.
 */
export type EightsRule = "playerNames" | "nextPlayerNames";

/**
 * What an 8 turned up as the very first card means.
 *
 * `natural` plays it as an ordinary 8 of its printed suit. `dealerNames` is the
 * **Dealer's Choice** alternate rule, where the dealer names the suit instead —
 * the one advantage dealing carries in this game.
 */
export type SeedEightRule = "natural" | "dealerNames";

/**
 * The Sunny Rule's settings, or `null` at a table that plays without it.
 *
 * Null is the rule genuinely not existing rather than a rule that does nothing:
 * no challenge window is opened, and the per-draw position snapshot that makes
 * a rewind possible is never taken. See `rules.ts`.
 */
export interface SunnyRule {
  /** Draws a wrong caller sits out before they may accuse again. */
  readonly lockoutDraws: number;
}

/**
 * The house rules for one game. Data only — never functions.
 *
 * `applyIntent` clones the state on every intent, `Challenge.violation.snapshot`
 * clones it again, and `persist.ts` puts it through `JSON.stringify`. Anything
 * here that isn't structured-cloneable and JSON-serializable breaks all three.
 * Behaviour that varies is looked up from these values, not stored in them.
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
  /** Out of cards, out of the game. Kept in the seating order for the log. */
  eliminated: boolean;
}

export type SurrenderReason =
  /** The extra card a caught player gives up. Played on top of the pile. */
  "sunnyPunishment";

/**
 * What the game is waiting for. Anything other than `action` means one specific
 * player owes one specific decision before play continues.
 */
export type Phase =
  /** The player to move must play a card or draw one. */
  | { kind: "action" }
  /**
   * A suit is owed. `playerId` is whose call it is, which is *not* always the
   * player to move: under Power of Eights it is the next seat, and under
   * Dealer's Choice it is the dealer before anyone has played at all.
   *
   * Naming always advances the turn afterwards. That single rule covers every
   * variant, because each one seats the turn so that advancing lands on the
   * right player — see `handleChooseSuit`.
   */
  | { kind: "suit"; playerId: PlayerId }
  /** A Sunny call landed: they must now make the play they skipped. */
  | { kind: "sunnyPlay" }
  /** They were caught and owe the punishment card: any one, legality irrelevant. */
  | { kind: "surrender"; playerId: PlayerId; reason: SurrenderReason }
  | { kind: "over" };

/**
 * The position a challenged reach was made from: the hand the drawer held and
 * the board they faced, both frozen at the instant *before* they touched the
 * deck.
 *
 * Named because it is the shape of the accusation on both sides of the wire —
 * `Challenge.reach` on the server, `GameView.sunnyReach` at the table — and the
 * two must not be allowed to drift apart.
 */
export interface SunnyReach {
  hand: Card[];
  activeSuit: Suit;
  topRank: Rank;
}

/**
 * The pile as the moment of the reach left it — what a judged call peels back
 * to show the table.
 *
 * Derived on the way out and never stored: it is a handful of cards, all of
 * which went face up in front of everybody when they were played, arranged to
 * make one point. `inPlay` is the card the offender was matching against when
 * they reached for the deck instead, and `since` is everything that has landed
 * on top of it in the moments between the offence and the call. Put the named
 * card beside `inPlay` and the ruling reads itself.
 *
 * It says nothing a verdict could be reverse-engineered from beyond the verdict
 * already on the event. `activeSuit` is here because it has to be: a wild 8
 * overrides the suit you can see, and a pair judged without it reads wrong.
 */
export interface SunnyEvidence {
  /** The card in play at the instant of the reach. */
  inPlay: Card;
  /** The suit that had to be matched then, which `inPlay` alone may not say. */
  activeSuit: Suit;
  /** What reached the pile after the offence, oldest first. Usually none. */
  since: Card[];
}

/**
 * The face-up pile at the instant a `SunnyReach` describes, frozen alongside it.
 *
 * Kept off `SunnyReach` deliberately. That shape crosses the wire to a caller
 * *before* any verdict exists and the two ends must not drift; this exists only
 * to build evidence for a call already judged.
 */
export interface ReachPile {
  /** The card that was in play. */
  inPlay: Card;
  /** Every card already in the face-up pile, so what came later can be told apart. */
  ids: CardId[];
}

/**
 * The Sunny Rule challenge window.
 *
 * Opens on any draw and closes when the *next* player takes their first action,
 * so it can outlive the turn it belongs to — a call arriving after the turn
 * ended rewinds it. `violation` is populated only when the draw was actually
 * illegal, and it never leaves the server: `redact.ts` drops this whole object,
 * sending only whether a call is currently possible and — to whoever could make
 * one — `reach.hand` to accuse from. Nothing about `violation` itself, or which
 * of those cards was actually legal, ever goes out.
 */
export interface Challenge {
  drawerId: PlayerId;
  /** Every card drawn this turn, in order. */
  drawnIds: CardId[];
  /**
   * The offender's hand, and the board they faced, exactly as they stood
   * immediately before the reach a call would be about. This is what an
   * accusation is judged against: a card they only came to hold afterwards
   * must never be offered, or count, as an accusation.
   *
   * Which reach that is: the most recent one while nothing has been caught,
   * and then the offending one, frozen alongside `violation.snapshot` from the
   * same instant. See `recordDraw`.
   */
  reach: SunnyReach;
  /**
   * The pile at the same instant `reach` describes, frozen with it and by the
   * same rule. The two are read together to build the evidence a judged call
   * shows the table, so a version of one against the other's moment would
   * describe a board nobody ever faced.
   */
  reachPile: ReachPile;
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
  /**
   * The suit somebody *named* for the card in play, or null when nobody did.
   *
   * No rule reads this and nothing about play depends on it — `activeSuit` is
   * still the suit to match, and is set the same way whether it came off a
   * choice or off the printed card. This records only that a choice happened,
   * because that is not recoverable afterwards: a natural 8 seeded at the start,
   * a natural 8 turned up by a recycle or a Sunny call, and an 8 played to
   * settle a call all leave the state looking exactly like a named one.
   *
   * The comparison it replaces — `activeSuit !== topCard.suit` — was wrong in
   * one direction, and it was the interesting one: a player who names the 8's
   * own suit is making a real play, and the table was shown nothing at all
   * (#114).
   *
   * Set by `chooseSuit` and cleared wherever the card in play changes.
   */
  namedSuit: Suit | null;
  phase: Phase;
  challenge: Challenge | null;
  /** Non-null only while a landed Sunny call is being paid off. */
  sunny: SunnyResolution | null;
  drawsThisTurn: number;
  /**
   * Reaches for the deck at the table across the whole game, never reset. A
   * wrong caller's lockout is measured against this rather than against turns,
   * so it counts down at the same rate regardless of how draws land within a
   * turn. Counted where the window is — see `recordDraw` — so a reach that
   * found nothing at all doesn't move it.
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
  /** Increments on every turn change; useful for logs and for the UI. */
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
  | { type: "gameStarted"; upcard: Card }
  | { type: "played"; playerId: PlayerId; card: Card }
  | { type: "suitChosen"; playerId: PlayerId; suit: Suit }
  | { type: "drew"; playerId: PlayerId; card: Card }
  | { type: "reshuffled"; drawPileSize: number }
  /** A card turned face up off the deck. Always natural, never wild. */
  | { type: "turnedUp"; cards: Card[]; reason: TurnUpReason }
  /**
   * `card` is the one the caller named. It is public: the accusation is said
   * out loud, and a wrong one is worth being able to read back afterwards.
   *
   * `returned` are the cards the rewind takes back off the offender and puts
   * on the deck — empty for a call that missed, and for a reach at an empty
   * deck that brought nothing back.
   *
   * They are safe to broadcast even though `state.sunny` is not. Every one of
   * them was drawn face up, in front of everybody, and announced by its own
   * `drew` event; the rewind is the table watching that undone, not a peek at
   * what the deck is holding.
   *
   * `evidence` is what the table is shown instead of being asked to take the
   * ruling on faith — the pile as the offence left it, so the card that was
   * actually in play can be set beside the card `card` names. It goes out to
   * everybody, offender and spectators included: once a call has been judged
   * the judgement is public, and so is what it was judged on. It is built on
   * the way out of a challenge that has just been resolved, never held on the
   * state, and it carries nothing from the deck.
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
