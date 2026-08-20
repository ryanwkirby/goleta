/**
 * What arrived from the table, and how long it lives on screen. `useGoleta`
 * produces all four but does not own the ideas, and keeping them there is what
 * put `lib` and `net` in a cycle (#224). What they have in common is a lifetime.
 */

import type { ErrorCode, ErrorKind, GameEvent, ShoutKind } from "@goleta/engine";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface LoggedEvent {
  id: number;
  event: GameEvent;
  /** The table won't act out old news. */
  at: number;
}

/** `help` is one turn's worth; `hints` is the standing version being switched
 * on, after which the seat itself carries the mark (#187). */
export interface Shout {
  id: number;
  playerId: string;
  kind: ShoutKind;
}

/** The sentence is for the player; `code` is for the app. */
export interface GoletaError {
  /** Bumped on every refusal, including a repeat word for word: two unmatched taps
   * have to look like two answers, and identical words leave React with the same
   * element and an animation that has already run. */
  id: number;
  message: string;
  code?: ErrorCode;
  kind: ErrorKind;
}
