/**
 * Counting the games this browser has finished, and the one question that
 * follows the first of them. This was a `useLayoutEffect` in `Table.tsx` doing
 * four storage operations and a three-part decision, and it is the bookkeeping
 * behind #184.
 *
 * It sits beside `identity.ts` because it is the same subject and because `lib/`
 * was the wrong home: `lib` is a leaf that depends on nothing but the engine,
 * and this reaches into storage, which put the two folders back in the cycle
 * #224 had just removed.
 */

import {
  gamesFinished,
  gamesSeen,
  gamesToCredit,
  markGamesSeen,
  recordGamesFinished,
} from "./identity.ts";

/**
 * Whether to ask this player if they want to keep the highlights. Asked once,
 * after a first finished game, and only of somebody who has them to keep. It
 * *offers* rather than announces (#187), so both answers are real.
 */
export const shouldAskAboutHints = (before: number, total: number, hints: boolean): boolean =>
  before === 0 && total > 0 && hints;

/**
 * Move the bookmark, credit whatever this browser actually sat through, and say
 * whether that was somebody's first.
 *
 * Off `room.gamesPlayed` rather than the `gameOver` event, which survives a
 * reload and a redeploy. **The bookmark moves whether or not anything is
 * credited**, which is what keeps each game counted exactly once — and a watcher
 * moves it while being credited nothing.
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
