import { describe, expect, it } from "vitest";

import type { Card } from "@goleta/engine";

import { faceOf, landed, setOff, SETTLED, type PileHold } from "../src/lib/pileHold.ts";

/**
 * The pile lags the state while cards are on their way to it (#449). The shared
 * screen drew the played card the instant the message arrived and then flew the
 * same card in over the top of it, for 840ms — the answer up for the whole of
 * the movement meant to deliver it.
 *
 * Two properties hold the rest of it up. **Nothing here reads the verdict, the
 * player or the clock**: the hold is a count of cards in the air and the faces
 * they carry, so it cannot become a tell. And **it always lets go**: however a
 * batch is counted, once the last card has landed the pile is the state's again.
 */

const card = (id: string): Card => ({ id, rank: "7", suit: "H" });

const KING: Card = { id: "kc", rank: "K", suit: "C" };

describe("the pile while a card is inbound", () => {
  it("keeps drawing the card the flight is landing on", () => {
    const hold = setOff(SETTLED, 1, KING, false);
    // The state already says the played card is up; the pile says otherwise
    // until it gets there.
    expect(faceOf(hold, card("played"))).toEqual(KING);
  });

  it("hands the pile back to the state when the last card lands", () => {
    const flying = setOff(SETTLED, 1, KING, false);
    const settled = landed(flying, card("played"));
    expect(settled).toEqual(SETTLED);
    expect(faceOf(settled, card("played"))).toEqual(card("played"));
  });

  it("shows each card of a turn-up as it arrives, not the one after it", () => {
    // Three cards turned up in one batch: the pile steps through them rather
    // than jumping to the last one and waiting.
    const one = card("one");
    const two = card("two");
    let hold: PileHold = setOff(SETTLED, 3, KING, false);
    expect(faceOf(hold, card("three"))).toEqual(KING);

    hold = landed(hold, one);
    expect(faceOf(hold, card("three"))).toEqual(one);

    hold = landed(hold, two);
    expect(faceOf(hold, card("three"))).toEqual(two);

    hold = landed(hold, card("three"));
    expect(faceOf(hold, card("three"))).toEqual(card("three"));
  });

  it("draws nothing at all through a deal, because the upcard is the last card out", () => {
    const hold = setOff(SETTLED, 1, null, true);
    expect(faceOf(hold, card("upcard"))).toBeNull();
    expect(faceOf(landed(hold, card("upcard")), card("upcard"))).toEqual(card("upcard"));
  });

  it("empties rather than holding a board that had no card on it", () => {
    expect(faceOf(setOff(SETTLED, 1, null, false), card("upcard"))).toBeNull();
  });

  it("moves on when a second burst sets off mid-flight, and holds until both land", () => {
    const first = card("first");
    let hold = setOff(SETTLED, 1, KING, false);
    // The second play arrives before the first has landed. The board it left is
    // the first card, which is what the pile shows from here.
    hold = setOff(hold, 1, first, false);
    expect(hold.inbound).toBe(2);
    expect(faceOf(hold, card("second"))).toEqual(first);

    hold = landed(hold, first);
    expect(faceOf(hold, card("second"))).toEqual(first);

    hold = landed(hold, card("second"));
    expect(hold).toEqual(SETTLED);
  });

  it("cannot be driven below settled by a landing nobody counted", () => {
    // A backstop rather than a case that happens: a hold that went negative would
    // never let go of the pile again.
    expect(landed(SETTLED, card("stray"))).toEqual(SETTLED);
  });
});
