import { describe, expect, it } from "vitest";

import { CARD_WIDTH_PX } from "../src/components/Card.tsx";
import {
  FIT_TIGHTEST,
  PICKER_TIGHTEST,
  TIGHTEST,
  handSize,
  handStep,
  handWidth,
  loosest,
} from "../src/lib/handFan.ts";

/** A landscape phone, once the padding either side has taken its share. */
const PHONE = 828;

/** The largest hand that still fits without scrolling, once fully closed up. */
const atMostAtTheFloor = (available: number, size: "lg" | "xl" | "2xl"): number => {
  let cards = 1;
  while (handWidth(cards + 1, TIGHTEST, size) <= available) cards += 1;
  return cards;
};

describe("how big the cards go", () => {
  it("takes the biggest size on a landscape phone, where the row has the height", () => {
    // A 390px viewport, less the peek strip — and nothing else, since #131 took
    // the row of furniture off the bottom and gave the height to the cards.
    expect(handSize(300)).toBe("2xl");
  });

  it("falls back rather than rendering a row taller than its own box", () => {
    expect(handSize(240)).toBe("xl");
    expect(handSize(180)).toBe("lg");
    expect(handSize(0)).toBe("md");
  });

  it("steps down again for a row a picker is docked over", () => {
    // A landscape phone with the accusation picker up: the hand keeps what is
    // left, and what is left is under an `lg` card and the row's own padding.
    // Scrolling the hand instead is the thing #96 removed.
    expect(handSize(150)).toBe("md");
    expect(CARD_WIDTH_PX.md).toBeLessThan(CARD_WIDTH_PX.lg);
  });

  it("keeps every rung tall enough for the card it names, plus the lift", () => {
    // 32px of padding on the row, and 14px of it is the lift a selected card
    // takes; a rung that didn't clear its own card is a clipped row.
    const CARD_HEIGHT = { md: 96, lg: 128, xl: 176, "2xl": 240 };
    const PADDING = 32;
    for (const [height, size] of [
      [280, "2xl"],
      [216, "xl"],
      [168, "lg"],
      [136, "md"],
    ] as const) {
      expect(handSize(height)).toBe(size);
      expect(height).toBeGreaterThanOrEqual(CARD_HEIGHT[size] + PADDING);
    }
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
    expect(handSize(300)).toBe(handSize(300));
  });
});

describe("fanning your own hand in landscape", () => {
  it("leaves a hand that already fits completely alone", () => {
    // Six `xl` cards spread out across a landscape phone with room to spare;
    // past that they start closing up rather than shrinking.
    for (const cards of [1, 2, 5, 6]) {
      expect(handStep(PHONE, cards, "xl")).toBe(loosest("xl"));
    }
    expect(handWidth(6, loosest("xl"), "xl")).toBeLessThanOrEqual(PHONE);
  });

  it("tightens only as far as it has to, and never past the floor", () => {
    const eight = handStep(PHONE, 8, "xl");
    const twelve = handStep(PHONE, 12, "xl");

    expect(eight).toBeLessThan(loosest("xl"));
    expect(twelve).toBeLessThan(eight);
    expect(twelve).toBeGreaterThanOrEqual(TIGHTEST);
    // A hand of eight still shows most of every card — the AC's binding case.
    expect(eight).toBeGreaterThan(CARD_WIDTH_PX.xl * 0.7);
  });

  it("fits every hand it tightens for, so nothing has to be scrolled to be read", () => {
    for (const size of ["lg", "xl", "2xl"] as const) {
      const most = atMostAtTheFloor(PHONE, size);
      for (let cards = 1; cards <= most; cards += 1) {
        expect(handWidth(cards, handStep(PHONE, cards, size), size)).toBeLessThanOrEqual(PHONE);
      }
    }
  });

  it("stops at the floor rather than squeezing a card past a thumb", () => {
    expect(handStep(PHONE, atMostAtTheFloor(PHONE, "xl") + 1, "xl")).toBe(TIGHTEST);
    expect(handStep(PHONE, 40, "xl")).toBe(TIGHTEST);
    expect(handStep(10, 40, "xl")).toBe(TIGHTEST);
  });

  it("can keep an IRL landscape hand on screen by fitting past the old floor", () => {
    const cards = atMostAtTheFloor(PHONE, "xl") + 3;
    const fitted = handStep(PHONE, cards, "xl", TIGHTEST, true);

    expect(fitted).toBeLessThan(TIGHTEST);
    expect(handWidth(cards, fitted, "xl")).toBeLessThanOrEqual(PHONE);
  });

  it("asks fitting for nothing until the tap floor is actually reached", () => {
    // What the second tap costs is the rhythm of a turn, so the fan has to be
    // genuinely past `TIGHTEST` before `Hand` starts asking — and a real hand
    // never gets there on a phone this wide. Twelve is the worst the simulation
    // reaches across three hundred games; sixteen is what fits at the floor.
    for (let cards = 1; cards <= atMostAtTheFloor(PHONE, "xl"); cards += 1) {
      expect(handStep(PHONE, cards, "xl", TIGHTEST, true)).toBeGreaterThanOrEqual(TIGHTEST);
    }
  });

  it("stops fitting at its own floor rather than shaving a hand to stripes", () => {
    // Past here the sliver has left legibility behind as well as the tap, and
    // the row goes back to scrolling — see `Hand`.
    expect(handStep(PHONE, 400, "xl", TIGHTEST, true)).toBe(FIT_TIGHTEST);
    expect(handStep(PHONE, 400, "xl", TIGHTEST, true)).toBeGreaterThan(0);
  });

  it("keeps the floor absolute, because a thumb is the same width either way", () => {
    // The card gets bigger; the smallest hittable sliver does not.
    expect(handStep(PHONE, 40, "lg")).toBe(handStep(PHONE, 40, "xl"));
    expect(loosest("xl")).toBeGreaterThan(loosest("lg"));
  });

  it("holds a real hand at the big size without scrolling", () => {
    // Eight is the size the issue asks about, and twelve is a late game where
    // drawing has been going well. The bigger card costs three of the margin
    // and keeps the answer: fifteen fit at the floor, and the tap floor is what
    // binds first either way.
    expect(atMostAtTheFloor(PHONE, "xl")).toBeGreaterThanOrEqual(12);
    expect(atMostAtTheFloor(PHONE, "2xl")).toBeGreaterThanOrEqual(12);
  });

  it("does not buy the bigger card with the second tap", () => {
    // A wider card eats the same width the fan spends on slivers, so the rung
    // above `xl` has to be paid for out of the margin and not out of the tap
    // floor. Twelve is the worst hand the simulation reaches across three
    // hundred games, and it is still a one-tap hand at the biggest size.
    expect(handStep(PHONE, 12, "2xl", TIGHTEST, true)).toBeGreaterThanOrEqual(TIGHTEST);
  });

  it("has nothing to fan before it has been measured", () => {
    expect(handStep(0, 8, "xl")).toBe(loosest("xl"));
    expect(handStep(PHONE, 1, "xl")).toBe(loosest("xl"));
    expect(handStep(PHONE, 0, "xl")).toBe(loosest("xl"));
  });

  it("agrees with the card widths it is drawn against", () => {
    expect(loosest("xl")).toBe(CARD_WIDTH_PX.xl + 6);
    expect(handWidth(1, 999, "xl")).toBe(CARD_WIDTH_PX.xl);
  });
});

/**
 * The accusation picker fans somebody else's hand at `sm`, and promises one row
 * whatever they are holding — a picker whose height came in card-row steps is
 * what left the landscape column short at both ends (#96).
 */
const step = (cards: number, available = PHONE): number =>
  handStep(available, cards, "sm", PICKER_TIGHTEST);

describe("fanning the hand a Sunny call is named from", () => {
  it("leaves a hand that already fits spread out", () => {
    for (const cards of [1, 5, 12, 18]) {
      if (handWidth(cards, loosest("sm"), "sm") > PHONE) continue;
      expect(step(cards)).toBe(loosest("sm"));
    }
  });

  it("closes up rather than wrapping, for any hand a game can reach", () => {
    // 52 cards is every card in the deck in one hand: impossible in play, and
    // the row still answers with a single sliver rather than a second row.
    for (const cards of [20, 26, 40, 52]) {
      expect(step(cards)).toBeLessThan(loosest("sm"));
      expect(step(cards)).toBeGreaterThanOrEqual(PICKER_TIGHTEST);
    }
  });

  it("fits every hand it tightens for", () => {
    for (let cards = 1; handWidth(cards, PICKER_TIGHTEST, "sm") <= PHONE; cards += 1) {
      expect(handWidth(cards, step(cards), "sm")).toBeLessThanOrEqual(PHONE);
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
    expect(handWidth(20, step(20), "sm")).toBeLessThanOrEqual(PHONE);
  });
});
