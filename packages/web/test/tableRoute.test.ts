import { describe, expect, it } from "vitest";

import type { LoggedEvent } from "../src/lib/feed.ts";
import {
  isIrlPhone,
  shuffleEntryId,
  tableRoute,
  type TableSituation,
} from "../src/lib/tableRoute.ts";

/**
 * Which of five screens a phone is looking at, and in what order the question
 * is asked.
 *
 * This was four early returns spread across eighty lines of `Table.tsx`, built
 * from flags declared thirty lines apart, and none of it was covered — the one
 * piece of logic in the app that can silently show somebody the wrong screen
 * for a whole hand.
 */

/** An online player on a laptop: none of the IRL machinery applies. */
const online: TableSituation = {
  irl: false,
  gamesPlayed: 0,
  finished: false,
  seated: true,
  phone: false,
  portrait: true,
  judging: false,
  shuffleId: null,
  seatedFor: null,
  rotatedFor: null,
};

/** A seated player's phone at a table in one room, held sideways, mid-game. */
const atTheTable: TableSituation = {
  ...online,
  irl: true,
  phone: true,
  portrait: false,
  rotatedFor: 0,
};

const at = (over: Partial<TableSituation>): TableSituation => ({ ...atTheTable, ...over });

describe("the ordinary upright table is the fallback", () => {
  it("is what an online player gets, whatever their viewport", () => {
    expect(tableRoute(online).kind).toBe("full");
    expect(tableRoute({ ...online, phone: true, portrait: false }).kind).toBe("full");
  });

  it("is what an online room gets even after a shuffled deal", () => {
    // Online there is nobody to move, so the table just deals in the new
    // order (#199). The "take your seat" screen is IRL-only.
    expect(tableRoute({ ...online, shuffleId: 7, seatedFor: null }).kind).toBe("full");
  });

  it("is what a tablet propped at an IRL table gets", () => {
    // `phone` is a viewport question, never a user agent. A tablet is not a
    // phone and gets the whole table.
    expect(tableRoute(at({ phone: false })).kind).toBe("full");
  });
});

describe("getting up and sitting somewhere else comes first", () => {
  it("beats every other screen, including a judged call", () => {
    // Ahead of the rotate prompt and ahead of the peel: where you are sitting
    // has to be settled before which way up your phone is matters at all.
    expect(tableRoute(at({ shuffleId: 4, portrait: true, judging: true })).kind).toBe(
      "takeYourSeat",
    );
  });

  it("carries the shuffle's own id, so a second shuffle asks again", () => {
    const route = tableRoute(at({ shuffleId: 9 }));
    expect(route).toEqual({ kind: "takeYourSeat", shuffleId: 9 });
  });

  it("goes away once this phone has been shown that shuffle", () => {
    expect(tableRoute(at({ shuffleId: 4, seatedFor: 4 })).kind).toBe("compact");
  });

  it("comes back for the next shuffled deal", () => {
    // The id and not a boolean: a dismissal cannot be carried over.
    expect(tableRoute(at({ shuffleId: 11, seatedFor: 4 })).kind).toBe("takeYourSeat");
  });

  it("is not shown once the hand is over", () => {
    expect(tableRoute(at({ shuffleId: 4, finished: true })).kind).toBe("handOver");
  });

  it("is shown to a watcher in the room, who also has to move", () => {
    // Deliberately not gated on `seated`: a watcher at an IRL table is a person
    // sitting at it, and the numbered list is about the furniture.
    expect(tableRoute(at({ shuffleId: 4, seated: false })).kind).toBe("takeYourSeat");
  });
});

describe("the rotate prompt is asked once a deal", () => {
  it("blocks the first upright look at a deal", () => {
    expect(tableRoute(at({ portrait: true, rotatedFor: null })).kind).toBe("rotate");
  });

  it("is gone once this phone has been seen sideways in this deal", () => {
    expect(tableRoute(at({ portrait: true, gamesPlayed: 3, rotatedFor: 3 })).kind).toBe("full");
  });

  it("asks again at the next deal", () => {
    // Sitting down to a new hand is when a phone gets picked up, put down or
    // handed over — so it is per deal, never a once-ever flag.
    expect(tableRoute(at({ portrait: true, gamesPlayed: 4, rotatedFor: 3 })).kind).toBe("rotate");
  });

  it("never blocks a watcher, who holds no cards to read", () => {
    expect(tableRoute(at({ portrait: true, seated: false, rotatedFor: null })).kind).toBe("full");
  });

  it("never blocks an online player holding their phone upright", () => {
    expect(tableRoute({ ...online, phone: true, rotatedFor: null }).kind).toBe("full");
  });
});

describe("a judged call hands the screen back to the full table", () => {
  it("takes the compact hand view away for the length of it", () => {
    expect(tableRoute(at({ judging: true })).kind).toBe("full");
  });

  it("takes the end-of-hand screen away too", () => {
    // A game can end on the play a landed call forced, so the peel and the
    // ruling may still have the screen. They get it, and `handOver` follows.
    expect(tableRoute(at({ finished: true, judging: true })).kind).toBe("full");
  });

  it("gives the hand view back when the ruling is done", () => {
    expect(tableRoute(at({ judging: false })).kind).toBe("compact");
  });
});

describe("the sideways screens", () => {
  it("gives a seated player mid-game the hand view", () => {
    expect(tableRoute(atTheTable).kind).toBe("compact");
  });

  it("gives a watcher the upright table rather than a hand they do not hold", () => {
    expect(tableRoute(at({ seated: false })).kind).toBe("full");
  });

  it("gives the end-of-hand screen to a watcher as well as a player", () => {
    // Not gated on `seated`: the offer it carries — join the next game — is the
    // one thing a watcher is there for.
    expect(tableRoute(at({ finished: true })).kind).toBe("handOver");
    expect(tableRoute(at({ finished: true, seated: false })).kind).toBe("handOver");
  });

  it("sends a finished hand upright to the full table, not to handOver", () => {
    expect(tableRoute(at({ finished: true, portrait: true })).kind).toBe("full");
  });
});

describe("what counts as a phone at an IRL table", () => {
  it("needs the room, the viewport, a seat and a game in progress", () => {
    expect(isIrlPhone(atTheTable)).toBe(true);
    expect(isIrlPhone(at({ irl: false }))).toBe(false);
    expect(isIrlPhone(at({ phone: false }))).toBe(false);
    expect(isIrlPhone(at({ seated: false }))).toBe(false);
  });

  it("goes false the moment the hand ends, and that is load-bearing", () => {
    // `gamesPlayed` moves at *game over*, not at the next deal. If this stayed
    // true past the final event, the rotate bookkeeping would stamp the number
    // the *next* deal is about to be asked about — and that deal would never
    // prompt. Asked once per deal is the rule; this is the line that keeps it.
    expect(isIrlPhone(at({ finished: true }))).toBe(false);
  });
});

const entry = (id: number, type: string, seatsShuffled?: boolean): LoggedEvent =>
  ({ id, at: 0, event: { type, seatsShuffled } }) as unknown as LoggedEvent;

describe("finding the shuffled deal in the log", () => {
  it("is null when this deal did not shuffle", () => {
    expect(shuffleEntryId([entry(2, "gameStarted", false), entry(1, "drew")])).toBeNull();
  });

  it("is null on an empty log, which is every page load", () => {
    expect(shuffleEntryId([])).toBeNull();
  });

  it("finds the shuffled deal and reports its id", () => {
    expect(shuffleEntryId([entry(5, "drew"), entry(4, "gameStarted", true)])).toBe(4);
  });
});
