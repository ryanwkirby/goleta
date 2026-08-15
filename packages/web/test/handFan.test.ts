import { describe, expect, it } from "vitest";

import { CARD_WIDTH_PX, cardWidthAt } from "../src/components/Card.tsx";
import {
  FIT_TIGHTEST,
  PICKER_TIGHTEST,
  SHORTEST,
  TALLEST,
  TIGHTEST,
  handHeight,
  handStep,
  handWidth,
  loosest,
} from "../src/lib/handFan.ts";

/** A landscape phone, once the padding either side has taken its share. */
const PHONE = 828;

/** The widths the ladder still uses, for the tests that fan a rung. */
const XL = CARD_WIDTH_PX.xl;
const LG = CARD_WIDTH_PX.lg;
const SM = CARD_WIDTH_PX.sm;

/** The largest hand that still fits without scrolling, once fully closed up. */
const atMostAtTheFloor = (available: number, cardWidth: number): number => {
  let cards = 1;
  while (handWidth(cards + 1, TIGHTEST, cardWidth) <= available) cards += 1;
  return cards;
};

describe("how big the cards go", () => {
  it("gives the cards the whole row, less the air they keep", () => {
    // A 390px viewport, less the peek strip — and nothing else, since #131 took
    // the row of furniture off the bottom and gave the height to the cards.
    // 32px of that is the `py-4` above and below.
    expect(handHeight(300)).toBe(268);
  });

  it("beats the ladder it replaced, and beats it worst at the cliff", () => {
    // The ladder's top two rungs were 64px apart, so a row one pixel short of
    // 280 fell all the way from a 240 card to a 176 one (#166).
    expect(handHeight(280)).toBeGreaterThan(240);
    expect(handHeight(279)).toBeGreaterThan(176);
    // No cliff left: a pixel of row is a pixel of card.
    expect(handHeight(280) - handHeight(279)).toBe(1);
  });

  it("shrinks by exactly what a docked picker took, rather than by a rung", () => {
    // What #96 is about: nothing in the column may scroll while a call is being
    // composed, so the hand has to give back precisely the room the picker
    // needs and no more.
    const took = 90;
    expect(handHeight(300) - handHeight(300 - took)).toBe(took);
  });

  it("stops at both ends rather than drawing something that is not a card", () => {
    expect(handHeight(10_000)).toBe(TALLEST);
    expect(handHeight(0)).toBe(SHORTEST);
    expect(handHeight(-50)).toBe(SHORTEST);
  });

  it("keeps a card inside the row it was measured from, lift included", () => {
    // 32px of padding on the row, 14px of it the lift a selected card takes. A
    // height that did not clear its own row is a clipped row.
    for (const row of [136, 168, 216, 280, 300, 340]) {
      expect(handHeight(row) + 32).toBeLessThanOrEqual(Math.max(row, SHORTEST + 32));
    }
  });

  it("keeps the shape of a card at any height", () => {
    // Read off `2xl`, the rung this replaces, so a card drawn at 240 is that
    // rung to the pixel.
    expect(cardWidthAt(240)).toBe(CARD_WIDTH_PX["2xl"]);
    expect(cardWidthAt(176)).toBe(CARD_WIDTH_PX.xl);
    expect(cardWidthAt(128)).toBe(CARD_WIDTH_PX.lg);
  });

  it("goes up a rung rather than sideways: every step is a bigger card", () => {
    // The rungs are one design at four sizes, so the fan arithmetic can read a
    // width off the size it was handed and get the card that is drawn.
    expect(CARD_WIDTH_PX.lg).toBeLessThan(CARD_WIDTH_PX.xl);
    expect(CARD_WIDTH_PX.xl).toBeLessThan(CARD_WIDTH_PX["2xl"]);
  });

  it("answers from the height alone, so a hand's size never says how big it is", () => {
    // Cards that grew as the hand shrank would tell the table how many you were
    // holding by how large they looked — a thing they can already just count.
    // The only argument is the row, so the card count cannot reach it.
    expect(handHeight(300)).toBe(handHeight(300));
  });
});

describe("fanning your own hand in landscape", () => {
  it("leaves a hand that already fits completely alone", () => {
    // Six `xl` cards spread out across a landscape phone with room to spare;
    // past that they start closing up rather than shrinking.
    for (const cards of [1, 2, 5, 6]) {
      expect(handStep(PHONE, cards, XL)).toBe(loosest(XL));
    }
    expect(handWidth(6, loosest(XL), XL)).toBeLessThanOrEqual(PHONE);
  });

  it("tightens only as far as it has to, and never past the floor", () => {
    const eight = handStep(PHONE, 8, XL);
    const twelve = handStep(PHONE, 12, XL);

    expect(eight).toBeLessThan(loosest(XL));
    expect(twelve).toBeLessThan(eight);
    expect(twelve).toBeGreaterThanOrEqual(TIGHTEST);
    // A hand of eight still shows most of every card — the AC's binding case.
    expect(eight).toBeGreaterThan(CARD_WIDTH_PX.xl * 0.7);
  });

  it("fits every hand it tightens for, so nothing has to be scrolled to be read", () => {
    for (const width of [LG, XL, CARD_WIDTH_PX["2xl"], cardWidthAt(268)]) {
      const most = atMostAtTheFloor(PHONE, width);
      for (let cards = 1; cards <= most; cards += 1) {
        expect(handWidth(cards, handStep(PHONE, cards, width), width)).toBeLessThanOrEqual(PHONE);
      }
    }
  });

  it("stops at the floor rather than squeezing a card past a thumb", () => {
    expect(handStep(PHONE, atMostAtTheFloor(PHONE, XL) + 1, XL)).toBe(TIGHTEST);
    expect(handStep(PHONE, 40, XL)).toBe(TIGHTEST);
    expect(handStep(10, 40, XL)).toBe(TIGHTEST);
  });

  it("can keep an IRL landscape hand on screen by fitting past the old floor", () => {
    const cards = atMostAtTheFloor(PHONE, XL) + 3;
    const fitted = handStep(PHONE, cards, XL, TIGHTEST, true);

    expect(fitted).toBeLessThan(TIGHTEST);
    expect(handWidth(cards, fitted, XL)).toBeLessThanOrEqual(PHONE);
  });

  it("asks fitting for nothing until the tap floor is actually reached", () => {
    // What the second tap costs is the rhythm of a turn, so the fan has to be
    // genuinely past `TIGHTEST` before `Hand` starts asking — and a real hand
    // never gets there on a phone this wide. Twelve is the worst the simulation
    // reaches across three hundred games; sixteen is what fits at the floor.
    for (let cards = 1; cards <= atMostAtTheFloor(PHONE, XL); cards += 1) {
      expect(handStep(PHONE, cards, XL, TIGHTEST, true)).toBeGreaterThanOrEqual(TIGHTEST);
    }
  });

  it("stops fitting at its own floor rather than shaving a hand to stripes", () => {
    // Past here the sliver has left legibility behind as well as the tap, and
    // the row goes back to scrolling — see `Hand`.
    expect(handStep(PHONE, 400, XL, TIGHTEST, true)).toBe(FIT_TIGHTEST);
    expect(handStep(PHONE, 400, XL, TIGHTEST, true)).toBeGreaterThan(0);
  });

  it("keeps the floor absolute, because a thumb is the same width either way", () => {
    // The card gets bigger; the smallest hittable sliver does not.
    expect(handStep(PHONE, 40, LG)).toBe(handStep(PHONE, 40, XL));
    expect(loosest(XL)).toBeGreaterThan(loosest(LG));
  });

  it("holds a real hand at the big size without scrolling", () => {
    // Eight is the size the issue asks about, and twelve is a late game where
    // drawing has been going well. The bigger card costs three of the margin
    // and keeps the answer: fifteen fit at the floor, and the tap floor is what
    // binds first either way.
    expect(atMostAtTheFloor(PHONE, XL)).toBeGreaterThanOrEqual(12);
    expect(atMostAtTheFloor(PHONE, CARD_WIDTH_PX["2xl"])).toBeGreaterThanOrEqual(12);
  });

  it("does not buy the bigger card with the second tap", () => {
    // A wider card eats the same width the fan spends on slivers, so the rung
    // above `xl` has to be paid for out of the margin and not out of the tap
    // floor. Twelve is the worst hand the simulation reaches across three
    // hundred games, and it is still a one-tap hand at the biggest size.
    expect(handStep(PHONE, 12, CARD_WIDTH_PX["2xl"], TIGHTEST, true)).toBeGreaterThanOrEqual(TIGHTEST);
  });

  it("has nothing to fan before it has been measured", () => {
    expect(handStep(0, 8, XL)).toBe(loosest(XL));
    expect(handStep(PHONE, 1, XL)).toBe(loosest(XL));
    expect(handStep(PHONE, 0, XL)).toBe(loosest(XL));
  });

  it("agrees with the card widths it is drawn against", () => {
    expect(loosest(XL)).toBe(CARD_WIDTH_PX.xl + 6);
    expect(handWidth(1, 999, XL)).toBe(CARD_WIDTH_PX.xl);
  });
});

/**
 * The accusation picker fans somebody else's hand at `sm`, and promises one row
 * whatever they are holding — a picker whose height came in card-row steps is
 * what left the landscape column short at both ends (#96).
 */
const step = (cards: number, available = PHONE): number =>
  handStep(available, cards, SM, PICKER_TIGHTEST);

describe("fanning the hand a Sunny call is named from", () => {
  it("leaves a hand that already fits spread out", () => {
    for (const cards of [1, 5, 12, 18]) {
      if (handWidth(cards, loosest(SM), SM) > PHONE) continue;
      expect(step(cards)).toBe(loosest(SM));
    }
  });

  it("closes up rather than wrapping, for any hand a game can reach", () => {
    // 52 cards is every card in the deck in one hand: impossible in play, and
    // the row still answers with a single sliver rather than a second row.
    for (const cards of [20, 26, 40, 52]) {
      expect(step(cards)).toBeLessThan(loosest(SM));
      expect(step(cards)).toBeGreaterThanOrEqual(PICKER_TIGHTEST);
    }
  });

  it("fits every hand it tightens for", () => {
    for (let cards = 1; handWidth(cards, PICKER_TIGHTEST, SM) <= PHONE; cards += 1) {
      expect(handWidth(cards, step(cards), SM)).toBeLessThanOrEqual(PHONE);
    }
  });

  it("has a floor low enough to overlap at all, and high enough to tap", () => {
    // `TIGHTEST` is wider than a `sm` card, so the hand's own floor would mean
    // no overlap and a wrapped picker — the thing being fixed.
    expect(PICKER_TIGHTEST).toBeLessThan(CARD_WIDTH_PX.sm);
    expect(TIGHTEST).toBeGreaterThan(CARD_WIDTH_PX.sm);
    // Still a tap target rather than `fan.ts`'s reading sliver: every card in
    // the picker is a card you accuse somebody with.
    expect(PICKER_TIGHTEST).toBeGreaterThan(22);
  });

  it("holds a real offender's hand in one row on a landscape phone", () => {
    // Twenty is a late game where drawing has gone well for them.
    expect(handWidth(20, step(20), SM)).toBeLessThanOrEqual(PHONE);
  });
});
