/**
 * Which of five screens a phone at this table is looking at.
 *
 * `Table.tsx` is one component that can return any of five completely different
 * things, and the guards deciding between them were four early returns spread
 * across eighty lines of the largest file in the repo, built out of flags
 * declared thirty lines apart. It is the most subtle logic in that file and it
 * had no tests at all, because nothing here renders a React component in a test
 * (#225).
 *
 * So it is arithmetic on plain values, in the order it is asked. Nothing in
 * here knows what React is.
 *
 * **The order is the design.** Getting up and sitting somewhere else (#199) has
 * to happen before which way you are holding your phone matters at all, and a
 * judged call takes the whole table back from either of the landscape screens.
 */

import type { LoggedEvent } from "./feed.ts";

/** The screen to draw. `full` is the ordinary upright table and the fallback. */
export type TableRoute =
  | { kind: "takeYourSeat"; shuffleId: number }
  | { kind: "rotate" }
  | { kind: "handOver" }
  | { kind: "compact" }
  | { kind: "full" };

export interface TableSituation {
  /** The room says this table is sitting together. Presentation, never a rule. */
  irl: boolean;
  /** Moves at *game over*, not at the next deal. Load-bearing — see below. */
  gamesPlayed: number;
  finished: boolean;
  /** There is a seat behind this screen. A watcher has none. */
  seated: boolean;
  /** The viewport says phone rather than tablet. Never a user agent. */
  phone: boolean;
  portrait: boolean;
  /** A call is being peeled, announced, or held on the offender's own dialog. */
  judging: boolean;
  /** The log id of the deal that shuffled the seats, if this one did. */
  shuffleId: number | null;
  /** The shuffle this phone has already been shown the new order for. */
  seatedFor: number | null;
  /** The deal this phone has already been seen sideways for. */
  rotatedFor: number | null;
}

/**
 * The seats have just been shuffled, as a log id rather than a boolean.
 *
 * The id and not a flag, so a second shuffled deal puts the list back up and a
 * dismissal cannot be carried over from the last one. The log starts empty on
 * every page load, so a reload mid-hand does not reopen it — which is right: it
 * is a "get up and move" screen, and by then everybody has.
 */
export const shuffleEntryId = (log: readonly LoggedEvent[]): number | null =>
  log.find((logged) => logged.event.type === "gameStarted" && logged.event.seatsShuffled)?.id ??
  null;

/**
 * Whether this screen is a phone at a table of people in the same room.
 *
 * All four have to hold, and none of them is a user agent: the room says it is
 * an IRL table, the viewport says this is a phone rather than a tablet propped
 * at one, there is a seat behind the screen, and there is a game running. The
 * lobby and the screens between games are untouched by any of it, and an online
 * room never sees a word of it.
 *
 * **`!finished` stays in here**, even though a sideways phone at the end of a
 * hand has a screen of its own (`handOver` below). This flag is what the rotate
 * bookkeeping hangs off, and `gamesPlayed` moves at *game over* rather than at
 * the next deal — so a version of it that stayed true past the final event
 * would stamp `rotatedFor` with the number the next deal is going to be asked
 * about, and that deal would never prompt. Asked once per deal is the rule;
 * this is the line that keeps it.
 */
export const isIrlPhone = (at: TableSituation): boolean =>
  at.irl && at.phone && at.seated && !at.finished;

export const tableRoute = (at: TableSituation): TableRoute => {
  /**
   * The seats have just been shuffled, and this is a table sitting in one room.
   *
   * Only in an IRL room: online there is nobody to move, so the table simply
   * deals in the new order (#199). It is first because getting up and sitting
   * somewhere else has to happen before anything else about the screen matters.
   */
  if (at.irl && !at.finished && at.shuffleId !== null && at.seatedFor !== at.shuffleId) {
    return { kind: "takeYourSeat", shuffleId: at.shuffleId };
  }

  const irlPhone = isIrlPhone(at);

  // A landscape layout on a phone held upright shows half of itself, and no web
  // page can turn somebody's phone for them — so the prompt *is* the mechanism
  // (#79). It is asked once a deal: after that, upright means the whole table,
  // which is a view rather than a mistake. Nothing pauses behind it either way —
  // the game is on the server, and a player holding their phone the wrong way is
  // late, not somebody the table waits on.
  if (irlPhone && at.portrait && at.rotatedFor !== at.gamesPlayed) return { kind: "rotate" };

  /**
   * The same phone, sideways, once the hand is over (#158).
   *
   * Not `isIrlPhone` for the reason above, and not `seated` either: a watcher's
   * phone lands on the same upright column, and the offer it is scrolling past
   * — join the next game — is the one thing it is there for.
   *
   * It waits for `judging` exactly as the hand view does. A game can end on the
   * play a landed call forced, so the peel and the ruling may still have the
   * screen; they get it, and this comes up after.
   */
  if (at.irl && at.phone && !at.portrait && at.finished && !at.judging) {
    return { kind: "handOver" };
  }

  /**
   * A judged call takes the whole table back, whichever view you were in.
   *
   * The peel rewinds the pile to the moment of the reach with two cards marked
   * and then announces the ruling (#63) — the one moment in this game the whole
   * table is meant to watch happen. It cannot play out in a 40px strip, so the
   * hand view hands over for the length of it, offender's dialog included, and
   * comes back when it is done.
   */
  if (irlPhone && !at.portrait && !at.judging) return { kind: "compact" };

  return { kind: "full" };
};
