import { describe, expect, it } from "vitest";

import { CARD_WIDTH_PX } from "../src/components/Card.tsx";
import { TIGHTEST, handSize, handStep, handWidth, loosest } from "../src/lib/handFan.ts";

/** A landscape phone, once the padding either side has taken its share. */
const PHONE = 828;

/** The largest hand that still fits without scrolling, once fully closed up. */
const atMostAtTheFloor = (available: number, size: "lg" | "xl"): number => {
  let cards = 1;
  while (handWidth(cards + 1, TIGHTEST, size) <= available) cards += 1;
  return cards;
};

describe("how big the cards go", () => {
  it("takes the big size on a landscape phone, where the row has the height", () => {
    // A 390px viewport, less the peek strip and the footer.
    expect(handSize(300)).toBe("xl");
  });

  it("falls back rather than rendering a row taller than its own box", () => {
    expect(handSize(180)).toBe("lg");
    expect(handSize(0)).toBe("lg");
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
    for (const size of ["lg", "xl"] as const) {
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

  it("keeps the floor absolute, because a thumb is the same width either way", () => {
    // The card gets bigger; the smallest hittable sliver does not.
    expect(handStep(PHONE, 40, "lg")).toBe(handStep(PHONE, 40, "xl"));
    expect(loosest("xl")).toBeGreaterThan(loosest("lg"));
  });

  it("holds a real hand at the big size without scrolling", () => {
    // Eight is the size the issue asks about, and twelve is a late game where
    // drawing has been going well.
    expect(atMostAtTheFloor(PHONE, "xl")).toBeGreaterThanOrEqual(12);
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
