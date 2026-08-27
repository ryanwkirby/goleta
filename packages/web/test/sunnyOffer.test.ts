import { describe, expect, it } from "vitest";

import type { Card, GameView, SunnyOffence } from "@goleta/engine";

import type { SunnyCalled } from "../src/lib/judgedCall.ts";
import {
  accusePickerOpen,
  caughtNarration,
  caughtState,
  stillAccusable,
  sunnyTarget,
} from "../src/lib/sunnyOffer.ts";

/**
 * The window to make an accusation, and the dialog for having one land on you.
 *
 * The thing this file must never learn is whether a call would actually be
 * correct. `sunnyCallable` is true after any draw by somebody else, legal or
 * not — offering the sun only when a call would land would hand over the answer
 * the whole rule depends on nobody being given (#50).
 */

const view = (over: Partial<GameView> = {}): GameView =>
  ({
    you: "me",
    sunnyCallable: false,
    sunnyTargetId: null,
    sunnyReach: null,
    ...over,
  }) as unknown as GameView;

/** Whatever the offender was holding. What is in it decides nothing here. */
const reach = { hand: [], activeSuit: "S", topRank: "5" } as unknown as GameView["sunnyReach"];

const called = (over: Partial<SunnyCalled> = {}): SunnyCalled =>
  ({ type: "sunnyCalled", correct: true, targetId: "me", ...over }) as unknown as SunnyCalled;

describe("whose reach is on offer", () => {
  it("is nobody when there is no window open", () => {
    expect(sunnyTarget(view(), null)).toBeNull();
  });

  it("names the one seat a call could be made about", () => {
    expect(sunnyTarget(view({ sunnyCallable: true, sunnyTargetId: "angela" }), null)).toBe(
      "angela",
    );
  });

  it("goes quiet while the picker is open", () => {
    // The picker *is* the call being composed. An offer to start one over the
    // top of it is an offer to do the thing you are already doing.
    expect(sunnyTarget(view({ sunnyCallable: true, sunnyTargetId: "angela" }), "angela")).toBeNull();
  });

  it("offers nothing to a viewer the server says cannot call", () => {
    // `sunnyCallable` is already false for a watcher, for the drawer
    // themselves and for anybody eliminated. This never second-guesses it.
    expect(sunnyTarget(view({ sunnyCallable: false, sunnyTargetId: "angela" }), null)).toBeNull();
  });
});

describe("whether the accusation being composed can still be made", () => {
  it("holds while the window is still open on that seat", () => {
    expect(stillAccusable(view({ sunnyCallable: true, sunnyTargetId: "angela" }), "angela")).toBe(
      true,
    );
  });

  it("drops when somebody else acts and shuts the window", () => {
    expect(stillAccusable(view({ sunnyCallable: false, sunnyTargetId: "angela" }), "angela")).toBe(
      false,
    );
  });

  it("drops when the window moves to a different seat", () => {
    // Somebody else drew while you were choosing. The card you were about to
    // name is not evidence about this reach.
    expect(stillAccusable(view({ sunnyCallable: true, sunnyTargetId: "bob" }), "angela")).toBe(
      false,
    );
  });
});

describe("whether the accusation picker is up", () => {
  // This is what conceals the log (#319), so it has to be true for exactly as
  // long as the picker is on the screen — no longer, or the log is gone from a
  // player who is not being asked anything.
  const open = view({ sunnyCallable: true, sunnyTargetId: "angela", sunnyReach: reach });

  it("is up while a call is being composed against an open window", () => {
    expect(accusePickerOpen(open, "angela")).toBe(true);
  });

  it("is not up merely because a call could be made", () => {
    // The sun is on offer on most turns of most games. If this were true of the
    // window rather than of the picker, the log would be concealed almost
    // continuously.
    expect(accusePickerOpen(open, null)).toBe(false);
  });

  it("goes down when the window shuts under it", () => {
    const shut = view({ sunnyCallable: false, sunnyTargetId: "angela", sunnyReach: reach });
    expect(accusePickerOpen(shut, "angela")).toBe(false);
  });

  it("goes down when the window moves to a different seat", () => {
    const moved = view({ sunnyCallable: true, sunnyTargetId: "bob", sunnyReach: reach });
    expect(accusePickerOpen(moved, "angela")).toBe(false);
  });

  it("is not up without the evidence it is composed from", () => {
    // `redact.ts` sends the reach and the flag together, so this is belt and
    // braces — and the screen draws no picker without it either way.
    expect(accusePickerOpen(view({ sunnyCallable: true, sunnyTargetId: "angela" }), "angela")).toBe(
      false,
    );
  });
});

describe("having a call land on you", () => {
  it("is nothing at all when no call has been judged", () => {
    expect(caughtState(null, undefined, null, false, "me")).toEqual({
      caughtYou: false,
      caughtHold: false,
      showCaught: false,
    });
  });

  it("is nothing when the call was about somebody else", () => {
    const state = caughtState(called({ targetId: "angela" }), 3, null, false, "me");
    expect(state.caughtYou).toBe(false);
    expect(state.caughtHold).toBe(false);
  });

  it("is nothing when the call was wrong", () => {
    // A wrong call costs the accused nothing at all, so there is no punishment
    // to walk anybody through.
    const state = caughtState(called({ correct: false }), 3, null, false, "me");
    expect(state.caughtYou).toBe(false);
  });

  it("holds the screen through the peel, without showing the dialog yet", () => {
    // Evidence first, then the ruling — the order for the offender too, and
    // they of all people are owed a look at why.
    const state = caughtState(called(), 3, null, true, "me");
    expect(state).toEqual({ caughtYou: true, caughtHold: true, showCaught: false });
  });

  it("shows the dialog once the evidence has been watched", () => {
    const state = caughtState(called(), 3, null, false, "me");
    expect(state).toEqual({ caughtYou: true, caughtHold: true, showCaught: true });
  });

  it("lets go once this call has been acknowledged", () => {
    const state = caughtState(called(), 3, 3, false, "me");
    expect(state.caughtHold).toBe(false);
    expect(state.showCaught).toBe(false);
  });

  it("catches you again on the next call, not just the first", () => {
    // Keyed on the log id: acknowledging call 3 must not pre-dismiss call 4.
    const state = caughtState(called(), 4, 3, false, "me");
    expect(state.caughtHold).toBe(true);
  });

  it("never catches a watcher, who has no seat to be called on", () => {
    // `targetId` on a `sunnyCalled` event is always a real seat, so a watcher's
    // null `you` can never match one.
    const state = caughtState(called({ targetId: "angela" }), 3, null, false, null);
    expect(state.caughtYou).toBe(false);
  });
});

/** Three seats in turn order, a deck with cards in it, and you in the first. */
const board = (over: Partial<GameView> = {}): GameView =>
  ({
    drawPileSize: 12,
    players: [
      { id: "me", cardCount: 3, eliminated: false, hand: [] },
      { id: "angela", cardCount: 4, eliminated: false, hand: [] },
      { id: "bo", cardCount: 4, eliminated: false, hand: [] },
    ],
    ...over,
  }) as unknown as GameView;

const drawn = { id: "7D#1", rank: "7", suit: "D" } as unknown as Card;

/**
 * What the offender is told, which was written for one offence when there are
 * two (#363). The trap this file exists to hold shut is inference: nothing
 * returned plus a deck that is not empty is *almost* the press, and "almost" is
 * how the dialog came to tell people they had drawn when they had not.
 */
describe("what the offender's dialog says", () => {
  it("names the offence the ruling names, rather than working it out", () => {
    const of = (via: SunnyOffence): string =>
      caughtNarration(called({ via, returned: [] }), board(), true).offence;
    expect(of("draw")).toBe("draw");
    expect(of("endTurn")).toBe("endTurn");
  });

  it("says a card was drawn when a ruling arrives without an offence on it", () => {
    // Every ruling this app has ever sent before #363 was the original offence.
    expect(caughtNarration(called({ via: null, returned: [] }), board(), true).offence).toBe(
      "draw",
    );
  });

  it("does not read the offence off the deck or the cards taken back", () => {
    // The press with an empty deck: `turnDrawnOut` is true because the deck
    // cannot be refilled, so somebody can press the button holding a play having
    // drawn nothing at all. Inference calls this a draw; the ruling does not.
    const narration = caughtNarration(
      called({ via: "endTurn", returned: [] }),
      board({ drawPileSize: 0 }),
      true,
    );
    expect(narration.offence).toBe("endTurn");
  });

  it("turns up what was drawn illegally, when anything was", () => {
    const narration = caughtNarration(called({ via: "draw", returned: [drawn] }), board(), true);
    expect(narration.step3).toEqual({ kind: "returned", cards: [drawn] });
  });

  it("shuffles the pile back when there is nothing to turn up and no deck", () => {
    // What actually happens: `finishSunny` calls `recycleFaceUpPile`, which turns
    // a card up. "Nothing to turn up" was never quite right here either.
    const narration = caughtNarration(
      called({ via: "draw", returned: [] }),
      board({ drawPileSize: 0 }),
      true,
    );
    expect(narration.step3).toEqual({ kind: "recycled" });
  });

  it("names the seat that is up next when nothing is turned up at all", () => {
    // The press, with a deck still in front of them. This is the case that used
    // to be told it had reached for an empty deck.
    const narration = caughtNarration(called({ via: "endTurn", returned: [] }), board(), true);
    expect(narration.step3).toEqual({ kind: "resumes", playerId: "angela" });
  });

  it("skips a seat that is already out when it names the next one", () => {
    const narration = caughtNarration(
      called({ via: "endTurn", returned: [] }),
      board({
        players: [
          { id: "me", cardCount: 3, eliminated: false, hand: [] },
          { id: "angela", cardCount: 0, eliminated: true, hand: [] },
          { id: "bo", cardCount: 4, eliminated: false, hand: [] },
        ] as unknown as GameView["players"],
      }),
      true,
    );
    expect(narration.step3).toEqual({ kind: "resumes", playerId: "bo" });
  });

  it("names no turn at all when the forced play is their last card", () => {
    // It puts them out on the spot, and if that leaves one player standing the
    // game is over — there is no next turn to promise. Say something true or say
    // nothing.
    const narration = caughtNarration(called({ via: "endTurn", returned: [] }), board(), false);
    expect(narration.step3).toEqual({ kind: "nothing" });
  });

  it("still turns up the drawn cards when the forced play puts them out", () => {
    // Being eliminated does not change what step three does with cards that were
    // drawn illegally: `demandPunishment` skips step two and goes straight to it.
    const narration = caughtNarration(called({ via: "draw", returned: [drawn] }), board(), false);
    expect(narration.step3).toEqual({ kind: "returned", cards: [drawn] });
  });
});
