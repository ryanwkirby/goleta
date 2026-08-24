/**
 * What arrived from the table, and how long it lives on screen. `useGoleta`
 * produces all four but does not own the ideas, and keeping them there is what
 * put `lib` and `net` in a cycle (#224). What they have in common is a lifetime.
 */

import type { ErrorCode, ErrorKind, FeedEvent, ShoutKind } from "@goleta/engine";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface LoggedEvent {
  id: number;
  /** A `GameEvent` or, since #256, one of the handful of things that happen to
   * the *table* rather than inside the game. The log is one list of what has
   * happened, so it carries both; the places that plan card movement filter with
   * `isGameEvent`, a departure having no cards in the air. */
  event: FeedEvent;
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

/**
 * Whether a logged event is still worth acting out, or is only now being read
 * back. `TableMotion` has had this rule since the flights were written — "the
 * table acts out what just happened, never what it is only now being shown" —
 * and the three moment hooks did not, so every one of them replayed on a
 * remount: closing the rules screen swaps the whole table back in (`App.tsx`),
 * and a Sunny call judged minutes earlier announced itself again (#357).
 *
 * A bookmark would have been the wrong shape. Anything remembering "seen this
 * one" has to outlive the thing that unmounts, and a bookmark taken at mount
 * swallows a call that landed while the rules screen was open — which is the
 * case that most needs saying. Freshness needs nothing remembered by anybody: a
 * moment is news for as long as the moment itself lasts, so `lasts` is the
 * beat's own figure from `beats.ts` rather than a number tuned here. Come back
 * part-way through one and you are owed it from the top; come back after it and
 * the log is where it lives.
 *
 * It is asked **once, when the beat would start**, and never again while it
 * runs: a screen that re-read it every render would drop the ruling on the floor
 * mid-sentence the moment the window passed.
 */
export const stillNews = (entry: LoggedEvent | undefined, lasts: number, now: number): boolean =>
  entry !== undefined && now - entry.at < lasts;
