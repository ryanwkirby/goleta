/**
 * The wire contract between the browser and the server.
 *
 * It lives in the engine package because that is the one package both sides
 * already depend on — not because it's part of the rules. Nothing here may
 * import from `rules.ts`; these are shapes, not behaviour.
 *
 * See `docs/PROTOCOL.md` for the conversation these messages make up.
 */

import type { GameView } from "./redact.ts";
import type { EightsRule, GameEvent, Intent, PlayerId, SeedEightRule, Suit } from "./types.ts";

/**
 * The house rules a table may actually choose, which is deliberately a smaller
 * thing than `GameOptions`.
 *
 * The engine's options also carry `deckCount` and `startingHandSize`, and those
 * are not on offer: they come from a client, and a hand size of 900 or a deck
 * count of a million is a denial of service rather than a house rule. The
 * server maps this onto a full `GameOptions` itself, so the only values that
 * can ever reach the engine are ones named here.
 *
 * `sunny` is a plain boolean this pass — the rule is on or it is off. When the
 * resolution itself becomes configurable this is where that would widen.
 */
export interface HouseRules {
  eights: EightsRule;
  seedEight: SeedEightRule;
  sunny: boolean;
}

export interface SeatView {
  id: PlayerId;
  name: string;
  bot: boolean;
  connected: boolean;
  isHost: boolean;
}

/**
 * How fast the bots play. A table setting rather than a personal one: bots are
 * timed on the server, so everyone watches the same pace.
 */
export type BotSpeed = "human" | "lightning";

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
}

export type ClientMessage =
  | { t: "create"; name: string }
  | { t: "join"; code: string; name: string }
  /** Reclaim a seat after a reload, a dropped connection or a redeploy. */
  | { t: "rejoin"; code: string; playerId: PlayerId; token: string }
  /** A screen that shows the table and holds no cards. */
  | { t: "watch"; code: string }
  | { t: "intent"; intent: Intent }
  | { t: "start" }
  | { t: "addBot" }
  | { t: "removeSeat"; playerId: PlayerId }
  /** Host only, between games: how fast the bots at this table play. */
  | { t: "setBotSpeed"; speed: BotSpeed }
  /** Host only, between games: which rules this table plays by. */
  | { t: "setHouseRules"; rules: HouseRules }
  /**
   * "I've opened the picker to name a card", and then "I'm done with it".
   *
   * Holds the bots while a call is being composed, so the window can't shut
   * under somebody part-way through deciding. Nothing about it is broadcast:
   * that a player is considering a call is not something the rest of the table
   * gets told. See `holdCall`.
   */
  | { t: "composingCall"; open: boolean }
  /** "I'm stuck." Turns your own highlights back on, and tells the table. */
  | { t: "help" }
  | { t: "ping" };

export type ServerMessage =
  /** Identity for this browser. The token is stored and never broadcast. */
  | { t: "welcome"; code: string; playerId: PlayerId | null; token: string | null }
  | { t: "state"; room: RoomView; game: GameView | null; events: GameEvent[] }
  /**
   * Somebody said something out loud. Not a game event: nothing about the
   * position changes, it isn't replayed, and it isn't in the log — it happens
   * and it's gone, like speaking.
   */
  | { t: "shout"; playerId: PlayerId; kind: "help" }
  | { t: "error"; message: string }
  | { t: "pong" };

/** Suit names for UI copy, kept next to the protocol so both sides agree. */
export type SuitKey = Suit;
