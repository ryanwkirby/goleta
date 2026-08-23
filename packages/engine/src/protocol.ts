/**
 * The wire contract between the browser and the server. Lives in the engine
 * package because that is the one both sides already depend on — nothing here
 * may import from `rules.ts`. See `docs/PROTOCOL.md`.
 */

import type { GameView } from "./redact.ts";
import { DEFAULT_OPTIONS } from "./types.ts";
import type { EightsRule, GameEvent, Intent, PlayerId, SeedEightRule, Suit } from "./types.ts";

/**
 * The house rules a table may choose — deliberately smaller than `GameOptions`.
 * `deckCount` and `startingHandSize` are not on offer: they would arrive from a
 * browser, and a hand size of 900 is a denial of service.
 */
export interface HouseRules {
  eights: EightsRule;
  seedEight: SeedEightRule;
  sunny: boolean;
}

/** The game as written, in the wire's vocabulary — read off `DEFAULT_OPTIONS`
 * rather than restated, so the two cannot drift. For a screen that has to
 * describe the rules before there is a table to ask. */
export const DEFAULT_HOUSE_RULES: HouseRules = {
  eights: DEFAULT_OPTIONS.eights,
  seedEight: DEFAULT_OPTIONS.seedEight,
  sunny: DEFAULT_OPTIONS.sunny !== null,
};

export interface SeatView {
  id: PlayerId;
  name: string;
  bot: boolean;
  connected: boolean;
  isHost: boolean;
  /**
   * Whether this seat is playing with its playable cards marked up (#187).
   * Presentation, never a rule. Public on purpose: help is always available and
   * taking it is never quiet (#33). Switching it *off* is not announced.
   */
  hinted: boolean;
}

/** How fast the bots play. A table setting — bots are timed on the server. */
export type BotSpeed = "human" | "lightning";

/**
 * Something a seat says out loud. `help` is one turn's worth; `hints` is a
 * standing state being switched on. Nothing shouts when either is switched off.
 */
export type ShoutKind = "help" | "hints";

/**
 * How a table picks who deals (#198). Not a house rule: `startGame` takes a
 * `dealerIndex` and knows nothing about how it was chosen.
 */
export type DealerMode = "rotate" | "random";

export interface RoomView {
  code: string;
  hostId: PlayerId;
  seats: SeatView[];
  status: "lobby" | "playing" | "finished";
  gamesPlayed: number;
  minPlayers: number;
  maxPlayers: number;
  lastWinnerId: PlayerId | null;
  botSpeed: BotSpeed;
  /** What this table is playing. Applies at the next deal, not to a live game. */
  houseRules: HouseRules;
  /** "We are all sitting in the same room." Presentation, not a rule. */
  irl: boolean;
  /** Read once at `beginGame`, so it describes the *next* deal — which is why it
   * is not frozen mid-game the way `botSpeed` is (#198). */
  dealerMode: DealerMode;
  /** Seat order is turn order, so this is not cosmetic. Read once at `beginGame`,
   * and independent of `dealerMode` (#199). */
  shuffleSeats: boolean;
  /**
   * Shared table screens connected right now (#138). Connection state, not room
   * state: counted off the open sockets every time a view is built, never
   * stored and never persisted. Nothing may depend on it being non-zero.
   */
  tableScreens: number;
}

export type ClientMessage =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  /** Reclaim a seat after a reload, a dropped connection or a redeploy. */
  | { t: "rejoin"; code: string; playerId: PlayerId; token: string }
  /** A screen that shows the table and holds no cards. */
  | { t: "watch"; code: string; table?: boolean }
  | { t: "intent"; intent: Intent }
  | { t: "start" }
  | { t: "addBot" }
  | { t: "removeSeat"; playerId: PlayerId }
  /**
   * Host only, between games: move a seat one place along. One hop rather than a
   * whole `order: PlayerId[]`, because an order posted from a browser can arrive
   * after a seat has left and a stale permutation is worse to reconcile.
   */
  | { t: "moveSeat"; playerId: PlayerId; direction: "up" | "down" }
  /** Host only, between games: how fast the bots at this table play. */
  | { t: "setBotSpeed"; speed: BotSpeed }
  /**
   * Host only, at any time — not frozen mid-game, unlike bot speed: no timer and
   * no rule reads it.
   */
  | { t: "setIrl"; on: boolean }
  /**
   * Host only, at any time. Not frozen mid-game: read once at the deal, and the
   * game keeps its own copy, so this always describes the *next* game.
   */
  | { t: "setHouseRules"; rules: HouseRules }
  /**
   * Host only, at any time. Its own message rather than a fourth field on
   * `HouseRules`, which carries the three written alternates only.
   */
  | { t: "setDealerMode"; mode: DealerMode }
  /** Host only, at any time. Read once at the deal, like `setDealerMode`. */
  | { t: "setShuffleSeats"; on: boolean }
  /**
   * "I've opened the picker", then "I'm done with it". Holds the bots so the
   * window can't shut under somebody part-way through deciding. Never broadcast.
   */
  | { t: "composingCall"; open: boolean }
  /** "I'm stuck." Turns your own highlights back on, and tells the table. */
  | { t: "help" }
  /**
   * Yours alone to send, host or not. The seat carries the answer, and turning it
   * *on* is announced.
   */
  | { t: "setHints"; on: boolean }
  | { t: "ping" };

export type ServerMessage =
  /** Identity for this browser. The token is stored and never broadcast. */
  | { t: "welcome"; code: string; playerId: PlayerId | null; token: string | null }
  | { t: "state"; room: RoomView; game: GameView | null; events: GameEvent[] }
  /** Not a game event: nothing about the position changes, and it isn't logged. */
  | { t: "shout"; playerId: PlayerId; kind: ShoutKind }
  | { t: "error"; message: string; code?: ErrorCode; kind?: ErrorKind }
  | { t: "pong" };

/**
 * A refusal the client can offer a way out of. The bar for another is that
 * reading the prose would otherwise be the only way to tell, and matching on
 * error wording breaks the next time somebody rewrites it.
 */
export type ErrorCode = "gameUnderWay";

/**
 * How long a refusal is worth looking at. A `move` is a mis-tap — the hand it
 * was aimed at already says so by not changing — so it goes away on its own; a
 * `session` waits to be dismissed. Not an `ErrorCode`: that says *which*.
 */
export type ErrorKind = "move" | "session";

/** Suit names for UI copy, kept next to the protocol so both sides agree. */
export type SuitKey = Suit;

/**
 * How long a name may be. A **layout** number: what every surface can show
 * whole, the narrowest being a phone's seat strip with eight seats. The server
 * enforces it, but the field that stops you typing an eleventh has to agree.
 * It was sixteen, and nothing could draw sixteen (#161).
 */
export const NAME_LIMIT = 10;
