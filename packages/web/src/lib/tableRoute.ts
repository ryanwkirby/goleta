/**
 * Which of five screens a phone at this table is looking at. These were early
 * returns spread across eighty lines of `Table.tsx` with no tests, because
 * nothing here renders a React component in a test (#225).
 *
 * **The order is the design**: getting up and sitting somewhere else (#199)
 * comes before which way you are holding your phone, and a judged call takes the
 * whole table back from either landscape screen.
 */

import type { LoggedEvent } from "./feed.ts";

export type TableRoute =
  | { kind: "takeYourSeat"; shuffleId: number }
  | { kind: "rotate" }
  | { kind: "handOver" }
  | { kind: "compact" }
  | { kind: "full" };

export interface TableSituation {
  irl: boolean;
  /** Moves at *game over*, not at the next deal. Load-bearing — see below. */
  gamesPlayed: number;
  finished: boolean;
  seated: boolean;
  phone: boolean;
  portrait: boolean;
  judging: boolean;
  shuffleId: number | null;
  seatedFor: number | null;
  rotatedFor: number | null;
}

/** An id and not a flag, so a second shuffled deal puts the list back up. The
 * log starts empty on every page load, so a reload mid-hand does not reopen it. */
export const shuffleEntryId = (log: readonly LoggedEvent[]): number | null =>
  log.find((logged) => logged.event.type === "gameStarted" && logged.event.seatsShuffled)?.id ??
  null;

/**
 * All four have to hold and none is a user agent. **`!finished` stays in here**:
 * this is what the rotate bookkeeping hangs off, and `gamesPlayed` moves at
 * *game over*, so a version that stayed true past the final event would stamp
 * `rotatedFor` with the next deal's number and that deal would never prompt.
 */
export const isIrlPhone = (at: TableSituation): boolean =>
  at.irl && at.phone && at.seated && !at.finished;

export const tableRoute = (at: TableSituation): TableRoute => {
  if (at.irl && !at.finished && at.shuffleId !== null && at.seatedFor !== at.shuffleId) {
    return { kind: "takeYourSeat", shuffleId: at.shuffleId };
  }

  const irlPhone = isIrlPhone(at);

  // No web page can turn somebody's phone, so the prompt *is* the mechanism (#79).
  // Asked once a deal, and nothing pauses behind it.
  if (irlPhone && at.portrait && at.rotatedFor !== at.gamesPlayed) return { kind: "rotate" };

  /** The same phone, sideways, once the hand is over (#158). Not `seated` either:
   * a watcher's phone lands here, and the offer to join the next game is what it
   * is there for. */
  if (at.irl && at.phone && !at.portrait && at.finished && !at.judging) {
    return { kind: "handOver" };
  }

  /** A judged call takes the whole table back: the peel cannot play out in a 40px strip (#63). */
  if (irlPhone && !at.portrait && !at.judging) return { kind: "compact" };

  return { kind: "full" };
};
