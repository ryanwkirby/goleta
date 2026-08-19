/**
 * What arrived from the table, and how long it lives on screen.
 *
 * Four shapes and no behaviour: a log entry, something a seat said out loud, a
 * refused move, and whether the socket is up. `useGoleta` produces all four,
 * but it does not own the ideas — the log is read by two hooks in here that
 * time the moments a whole table watches, and by three screens and a component
 * besides.
 *
 * They lived on the socket hook until #224, which is what put `lib` and `net`
 * in a cycle with each other: `judgedCall.ts` and `reshuffle.ts` are pure
 * enough to sit in `lib` and had to reach into `net` for the shape of the log
 * they read, while `net/identity.ts` was already reaching back the other way
 * for `HandSort`. Nothing here imports anything that runs.
 *
 * What they have in common is a lifetime. A log entry carries when it landed
 * because the table will not act out old news; a shout lasts a couple of
 * seconds; a refusal says how long it is worth showing. That is the thread, and
 * it is why they are one file rather than four.
 */

import type { ErrorCode, ErrorKind, GameEvent, ShoutKind } from "@goleta/engine";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface LoggedEvent {
  id: number;
  event: GameEvent;
  /** When this reached the browser. The table won't act out old news. */
  at: number;
}

/**
 * Something a seat said out loud. Lives for a couple of seconds.
 *
 * `help` is one turn's worth of marked-up cards, asked for and gone. `hints`
 * is the standing version being switched on — announced once here, and then
 * visible on the seat itself for as long as it lasts (#187).
 */
export interface Shout {
  id: number;
  playerId: string;
  kind: ShoutKind;
}

/**
 * A refusal, as the app has to deal with it. The sentence is for the player;
 * `code` is for the app, on the few refusals it can offer a way out of.
 */
export interface GoletaError {
  /**
   * Bumped on every refusal, including a repeat of one word for word.
   *
   * Tap two cards that don't match and the second one has to look like a second
   * answer — but the words are identical, so React keeps the same element and a
   * CSS animation that has already run doesn't run again. Keying the pill on
   * this is what replays it.
   */
  id: number;
  message: string;
  code?: ErrorCode;
  /** How long it's worth showing. See `ErrorKind`. */
  kind: ErrorKind;
}
