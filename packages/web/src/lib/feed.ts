/**
 * What arrived from the table, and how long it lives on screen: a log entry,
 * something a seat said out loud, a refused move, and whether the socket is up.
 *
 * `useGoleta` produces all four but does not own the ideas, and keeping them
 * there is what put `lib` and `net` in a cycle (#224). What the four have in
 * common is a lifetime, which is why they are one file rather than four.
 */

import type { ErrorCode, ErrorKind, GameEvent, ShoutKind } from "@goleta/engine";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface LoggedEvent {
  id: number;
  event: GameEvent;
  /** When this reached the browser. The table won't act out old news. */
  at: number;
}

/** `help` is one turn's worth, asked for and gone. `hints` is the standing
 * version being switched on — announced once here, then visible on the seat
 * itself for as long as it lasts (#187). */
export interface Shout {
  id: number;
  playerId: string;
  kind: ShoutKind;
}

/** The sentence is for the player; `code` is for the app, on the few refusals
 * it can offer a way out of. */
export interface GoletaError {
  /**
   * Bumped on every refusal, including a repeat of one word for word: two
   * unmatched taps have to look like two answers, and identical words leave
   * React with the same element and an animation that has already run.
   */
  id: number;
  message: string;
  code?: ErrorCode;
  /** How long it's worth showing. See `ErrorKind`. */
  kind: ErrorKind;
}
