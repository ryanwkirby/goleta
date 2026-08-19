/**
 * Counting the games this browser has finished, and the one question that
 * follows the first of them.
 *
 * This was a `useLayoutEffect` in `Table.tsx` doing four storage operations and
 * a three-part decision, and it is the bookkeeping behind #184 — a bug where a
 * player was still being shown her playable cards in her second game because
 * the count only moved if a screen happened to be mounted at the instant a
 * `gameOver` event arrived.
 *
 * It sits beside `identity.ts` because it is the same subject — what this
 * browser remembers — and because putting it in `lib/` was a mistake: `lib` is
 * a leaf that depends on nothing but the engine, and this reaches into storage,
 * which put the two folders back in the cycle #224 had just removed. Being
 * testable end to end is a payoff from the `localStorage` stub written for
 * `identity.ts` in #223, and that works from either folder.
 */

import {
  gamesFinished,
  gamesSeen,
  gamesToCredit,
  markGamesSeen,
  recordGamesFinished,
} from "./identity.ts";

/**
 * Whether to ask this player if they want to keep the highlights.
 *
 * Asked once, after a first finished game, and only of somebody who has them to
 * keep — nothing is being offered back to a player who never took them. It
 * *offers* rather than announces (#187): the highlights are a preference now,
 * not a countdown that expires, so both answers are real and neither happens
 * until one is pressed.
 */
export const shouldAskAboutHints = (before: number, total: number, hints: boolean): boolean =>
  before === 0 && total > 0 && hints;

/**
 * Move the bookmark, credit whatever this browser actually sat through, and say
 * whether that was somebody's first.
 *
 * Off `room.gamesPlayed` rather than off the `gameOver` event: the server owns
 * that number, every `RoomView` carries it, and it survives a reload, a
 * reconnect and a redeploy — which the event log, which starts empty on every
 * page load, does not.
 *
 * **The bookmark moves whether or not anything is credited**, which is what
 * keeps each game counted exactly once: coming back to a room whose game has
 * already finished credits it once, and arriving at a table three games in
 * credits none of them. A **watcher** moves the bookmark and is credited
 * nothing — they finished no games — so taking a seat afterwards starts from
 * where they sat down.
 */
export const creditFinishedGames = (
  code: string,
  played: number,
  /** Whether there is a seat behind this screen. A watcher is credited nothing. */
  seated: boolean,
  hints: boolean,
): boolean => {
  const credit = gamesToCredit(gamesSeen(code), played);
  markGamesSeen(code, played);
  if (credit === 0 || !seated) return false;
  const before = gamesFinished();
  const total = recordGamesFinished(credit);
  return shouldAskAboutHints(before, total, hints);
};
