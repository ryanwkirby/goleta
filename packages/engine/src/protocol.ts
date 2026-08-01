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
import type { GameEvent, Intent, PlayerId, Suit } from "./types.ts";

export interface SeatView {
  id: PlayerId;
  name: string;
  bot: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  code: string;
  hostId: PlayerId;
  startingHandSize: number;
  seats: SeatView[];
  status: "lobby" | "playing" | "finished";
  gamesPlayed: number;
  minPlayers: number;
  maxPlayers: number;
  lastWinnerId: PlayerId | null;
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
  | { t: "setStartingHandSize"; value: number }
  | { t: "addBot" }
  | { t: "removeSeat"; playerId: PlayerId }
  | { t: "ping" };

export type ServerMessage =
  /** Identity for this browser. The token is stored and never broadcast. */
  | { t: "welcome"; code: string; playerId: PlayerId | null; token: string | null }
  | { t: "state"; room: RoomView; game: GameView | null; events: GameEvent[] }
  | { t: "error"; message: string }
  | { t: "pong" };

/** Suit names for UI copy, kept next to the protocol so both sides agree. */
export type SuitKey = Suit;
