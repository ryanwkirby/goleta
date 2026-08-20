import { describe, expect, it } from "vitest";

import { CARD_WIDTH_PX, cardWidthAt } from "../src/lib/cardShape.ts";
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

/** The same phone upright, once the column's `p-3` has taken its share — the
 * narrow case, and the one #191 is about. */
const UPRIGHT = 366;

/** The widths the ladder still uses, for the tests that fan a rung. */
const XL = CARD_WIDTH_PX.xl;
const LG = CARD_WIDTH_PX.lg;
const SM = CARD_WIDTH_PX.sm;
/** What the upright table draws — `FULL_TABLE.hand`, and it stays a rung. */
const MD = CARD_WIDTH_PX.md;

/** The largest hand that still fits without scrolling, once fully closed up. */
const atMostAtTheFloor = (available: number, cardWidth: number): number => {
  let cards = 1;
  while (handWidth(cards + 1, TIGHTEST, cardWidth) <= available) cards += 1;
  return cards;
};

describe("how big the cards go", () => {
  it("gives the cards the whole row, less the air they keep", () => {
    // A 390px viewport less the peek strip, and nothing else since #131. 32px of
    // that is the `py-4` above and below.
    expect(handHeight(300)).toBe(268);
  });

  it("beats the ladder it replaced, and beats it worst at the cliff", () => {
    // The ladder's top two rungs were 64px apart, so a row one pixel short of 280
    // fell all the way from a 240 card to a 176 one (#166).
    expect(handHeight(280)).toBeGreaterThan(240);
    expect(handHeight(279)).toBeGreaterThan(176);
    // No cliff left: a pixel of row is a pixel of card.
    expect(handHeight(280) - handHeight(279)).toBe(1);
  });

  it("shrinks by exactly what a docked picker took, rather than by a rung", () => {
    // What #96 is about: nothing in the column may scroll while a call is being
    // composed, so the hand gives back precisely the room the picker needs.
    const took = 90;
    expect(handHeight(300) - handHeight(300 - took)).toBe(took);
  });

  it("stops at both ends rather than drawing something that is not a card", () => {
    expect(handHeight(10_000)).toBe(TALLEST);
    expect(handHeight(0)).toBe(SHORTEST);
    expect(handHeight(-50)).toBe(SHORTEST);
  });

  it("keeps a card inside the row it was measured from, lift included", () => {
    // 32px of padding on the row, 14px of it the lift a selected card takes.
    for (const row of [136, 168, 216, 280, 300, 340]) {
      expect(handHeight(row) + 32).toBeLessThanOrEqual(Math.max(row, SHORTEST + 32));
    }
  });

  it("keeps the shape of a card at any height", () => {
    // Read off `2xl`, the rung this replaces.
    expect(cardWidthAt(240)).toBe(CARD_WIDTH_PX["2xl"]);
    expect(cardWidthAt(176)).toBe(CARD_WIDTH_PX.xl);
    expect(cardWidthAt(128)).toBe(CARD_WIDTH_PX.lg);
  });

  it("goes up a rung rather than sideways: every step is a bigger card", () => {
    // The rungs are one design at four sizes, so the fan arithmetic can read a width
    // off the size it was handed and get the card that is drawn.
    expect(CARD_WIDTH_PX.lg).toBeLessThan(CARD_WIDTH_PX.xl);
    expect(CARD_WIDTH_PX.xl).toBeLessThan(CARD_WIDTH_PX["2xl"]);
  });

  it("answers from the height alone, so a hand's size never says how big it is", () => {
    // Cards that grew as the hand shrank would tell the table how many you were
    // holding. The only argument is the row, so the card count cannot reach it.
    expect(handHeight(300)).toBe(handHeight(300));
  });
});

describe("fanning your own hand in landscape", () => {
  it("leaves a hand that already fits completely alone", () => {
    // Six `xl` cards spread across a landscape phone with room to spare.
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
    // genuinely past `TIGHTEST` before `Hand` starts asking. Twelve is the worst
    // the simulation reaches across three hundred games; sixteen fits at the floor.
    for (let cards = 1; cards <= atMostAtTheFloor(PHONE, XL); cards += 1) {
      expect(handStep(PHONE, cards, XL, TIGHTEST, true)).toBeGreaterThanOrEqual(TIGHTEST);
    }
  });

  it("stops fitting at its own floor rather than shaving a hand to stripes", () => {
    // Past here the sliver has left legibility behind as well as the tap.
    expect(handStep(PHONE, 400, XL, TIGHTEST, true)).toBe(FIT_TIGHTEST);
    expect(handStep(PHONE, 400, XL, TIGHTEST, true)).toBeGreaterThan(0);
  });

  it("keeps the floor absolute, because a thumb is the same width either way", () => {
    // The card gets bigger; the smallest hittable sliver does not.
    expect(handStep(PHONE, 40, LG)).toBe(handStep(PHONE, 40, XL));
    expect(loosest(XL)).toBeGreaterThan(loosest(LG));
  });

  it("holds a real hand at the big size without scrolling", () => {
    // Eight is the size the issue asks about, twelve a late game where drawing has
    // gone well. The bigger card costs three of the margin and keeps the answer.
    expect(atMostAtTheFloor(PHONE, XL)).toBeGreaterThanOrEqual(12);
    expect(atMostAtTheFloor(PHONE, CARD_WIDTH_PX["2xl"])).toBeGreaterThanOrEqual(12);
  });

  it("does not buy the bigger card with the second tap", () => {
    // A wider card eats the width the fan spends on slivers, so the rung above `xl`
    // is paid for out of the margin and not out of the tap floor.
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

describe("fanning your own hand upright", () => {
  /** The upright hand is fitted, exactly as the landscape one is. */
  const upright = (cards: number, available = UPRIGHT): number =>
    handStep(available, cards, MD, TIGHTEST, true);

  it("leaves a hand that fits completely alone, at the spacing it always had", () => {
    // The loosest step is a whole card plus six pixels, which is the `gap-1.5` this
    // row used to be laid out with — so a hand that fits looks no different (#191).
    expect(loosest(MD)).toBe(CARD_WIDTH_PX.md + 6);
    for (const cards of [1, 2, 4, 5]) {
      expect(upright(cards)).toBe(loosest(MD));
    }
    expect(handWidth(5, loosest(MD), MD)).toBeLessThanOrEqual(UPRIGHT);
  });

  it("tightens before it scrolls, at every hand size a game reaches", () => {
    // The whole of the bug: past five cards the old upright row overflowed and you
    // read your own hand by scrolling it sideways.
    for (let cards = 6; cards <= 12; cards += 1) {
      const step = upright(cards);
      expect(step).toBeLessThan(loosest(MD));
      expect(handWidth(cards, step, MD)).toBeLessThanOrEqual(UPRIGHT);
    }
  });

  it("holds the biggest hand the simulation reaches, and pays for it with a tap", () => {
    // Twelve across three hundred games. It fits upright only by going under the tap
    // floor, which is the trade #117 already made. An upright column is 366px
    // against a landscape row's 828, so this binds far earlier here: seven cards
    // is the last one-tap hand on a 390px phone.
    const step = upright(12);
    expect(handWidth(12, step, MD)).toBeLessThanOrEqual(UPRIGHT);
    expect(step).toBeLessThan(TIGHTEST);
    expect(step).toBeGreaterThanOrEqual(FIT_TIGHTEST);
  });

  it("gives a wide column the whole hand on one tap each", () => {
    // The upright table is not only a phone: `max-w-3xl` is 768px on a laptop, where
    // every hand a game can produce stays above the tap floor.
    const LAPTOP = 744;
    for (let cards = 1; cards <= 16; cards += 1) {
      expect(upright(cards, LAPTOP)).toBeGreaterThanOrEqual(TIGHTEST);
      expect(handWidth(cards, upright(cards, LAPTOP), MD)).toBeLessThanOrEqual(LAPTOP);
    }
  });

  it("takes the second tap only once the sliver is thinner than a thumb", () => {
    // `Hand` asks twice when the step is under `TIGHTEST` and not before, so the
    // boundary is the thing worth pinning.
    let most = 1;
    while (handWidth(most + 1, TIGHTEST, MD) <= UPRIGHT) most += 1;
    for (let cards = 1; cards <= most; cards += 1) {
      expect(upright(cards)).toBeGreaterThanOrEqual(TIGHTEST);
    }
    expect(upright(most + 1)).toBeLessThan(TIGHTEST);
  });

  it("fits an adversarial hand well past anything a deck can deal", () => {
    // Past every hand a 52-card game can produce at a table of two.
    expect(handWidth(17, upright(17), MD)).toBeLessThanOrEqual(UPRIGHT);
    // Past that it stops at its own floor and scrolls rather than shaving the hand to
    // stripes — the same release valve the seat strip has (#59).
    expect(upright(60)).toBe(FIT_TIGHTEST);
  });

  it("keeps the card on the ladder however tight the fan gets", () => {
    // Only the step is measured upright: the column is shared, and a hand that grew
    // into the piles and the log would be taking room that is not its own.
    for (const cards of [1, 8, 20, 60]) {
      expect(upright(cards)).toBeLessThanOrEqual(loosest(MD));
      expect(handWidth(1, upright(cards), MD)).toBe(CARD_WIDTH_PX.md);
    }
  });

  it("has nothing to fan before it has been measured", () => {
    // Zero is what `useBox` reports until the first observation, and the answer has
    // to be the layout the row already had.
    expect(upright(8, 0)).toBe(loosest(MD));
  });
});

/** The accusation picker fans somebody else's hand at `sm` and promises one row
 * whatever they hold — a picker whose height came in card-row steps is what left
 * the landscape column short at both ends (#96). */
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
    // 52 cards in one hand: impossible in play, and still a single row.
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
    // `TIGHTEST` is wider than a `sm` card, so the hand's own floor would mean no
    // overlap and a wrapped picker — the thing being fixed.
    expect(PICKER_TIGHTEST).toBeLessThan(CARD_WIDTH_PX.sm);
    expect(TIGHTEST).toBeGreaterThan(CARD_WIDTH_PX.sm);
    // Still a tap target rather than `fan.ts`'s reading sliver.
    expect(PICKER_TIGHTEST).toBeGreaterThan(22);
  });

  it("holds a real offender's hand in one row on a landscape phone", () => {
    // Twenty is a late game where drawing has gone well for them.
    expect(handWidth(20, step(20), SM)).toBeLessThanOrEqual(PHONE);
  });
});
