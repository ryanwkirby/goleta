import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CARD_HEIGHT_PX,
  CARD_SHAPE,
  CARD_WIDTH_PX,
  LARGE_CARD_SHAPE,
  RANK_EM,
  cardHeightPx,
  cardWidthPx,
  readableSliver,
  shapeFor,
  type CardSize,
} from "../src/lib/cardShape.ts";
import { LARGE_SCALE, ROOT_PX, printScale } from "../src/lib/largePrint.ts";
import { SEAT_OUT_MIN, TIGHTEST as SLIVER_FLOOR, fanTable, stripWidth } from "../src/lib/fan.ts";
import {
  FIT_TIGHTEST,
  PICKER_TIGHTEST,
  SHORTEST,
  TALLEST,
  TIGHTEST,
  handHeight,
  handStep,
  handWidth,
} from "../src/lib/handFan.ts";

const SIZES: CardSize[] = ["sm", "md", "lg", "xl", "2xl"];

/**
 * **The bite #323 names, as a test.** The card ladder is written down twice —
 * here in pixels, and in `SIZES` in `Card.tsx` as rem-based Tailwind classes —
 * and large print moves them by two different mechanisms: the root font size
 * takes the classes, and `printScale` takes the constants. Nothing would fail if
 * they drifted, so this reads the component as text and fails instead.
 *
 * The same trick `pacing.test.ts` uses on `beats.ts`, and for the same reason:
 * a duplication that is paid for rather than assumed.
 */
const remOf = (token: string): number | null => {
  const arbitrary = /^[hw]-\[([\d.]+)rem\]$/.exec(token);
  if (arbitrary) return Number(arbitrary[1]);
  const step = /^[hw]-(\d+)$/.exec(token);
  // Tailwind's spacing scale: one unit is a quarter of a rem.
  return step ? Number(step[1]) / 4 : null;
};

const drawnLadder = (): Record<string, { width: number; height: number }> => {
  const src = readFileSync(resolve(import.meta.dirname, "../src/components/Card.tsx"), "utf8");
  const table = /const SIZES: Record<CardSize, string> = \{([\s\S]*?)\n\};/.exec(src);
  expect(table, "SIZES is still a table of classes in Card.tsx").not.toBeNull();

  const found: Record<string, { width: number; height: number }> = {};
  for (const line of (table?.[1] ?? "").split("\n")) {
    const row = /^\s*"?([\da-z]+)"?:\s*"([^"]+)"/.exec(line);
    if (!row) continue;
    const classes = (row[2] ?? "").split(" ");
    const height = classes.map(remOf).find((rem, at) => rem !== null && classes[at]?.startsWith("h-"));
    const width = classes.map(remOf).find((rem, at) => rem !== null && classes[at]?.startsWith("w-"));
    if (height === undefined || width === undefined || height === null || width === null) continue;
    found[row[1] as string] = { width: width * ROOT_PX, height: height * ROOT_PX };
  }
  return found;
};

describe("one ladder, written twice", () => {
  const drawn = drawnLadder();

  it("finds every rung in the component", () => {
    expect(Object.keys(drawn).toSorted()).toEqual(SIZES.toSorted());
  });

  it.each(SIZES)("draws %s at the pixels the constants record", (size) => {
    expect(drawn[size]).toEqual({ width: CARD_WIDTH_PX[size], height: CARD_HEIGHT_PX[size] });
  });

  /** The whole point of the pair being equal: the root font size takes one and
   * `printScale` takes the other, so in large print they still agree. A
   * `PlayingCard` is drawn from the constants and a `CardBack` beside it from the
   * classes, and the two are the same card. */
  it.each(SIZES)("keeps %s in step once large print has moved both", (size) => {
    const byClass = {
      width: (drawn[size]?.width ?? 0) * LARGE_SCALE,
      height: (drawn[size]?.height ?? 0) * LARGE_SCALE,
    };
    expect(byClass).toEqual({
      width: cardWidthPx(size, LARGE_SCALE),
      height: cardHeightPx(size, LARGE_SCALE),
    });
  });
});

describe("the large-print face", () => {
  /** `leading-[1.05]` on the rank, with the suit under it at `0.85em` on the
   * same line height. */
  const STACK_EM = 1.05 + 0.85 * 1.05;

  it("is a different set of fractions rather than a bigger text", () => {
    expect(shapeFor(true)).toBe(LARGE_CARD_SHAPE);
    expect(shapeFor(false)).toBe(CARD_SHAPE);
    expect(LARGE_CARD_SHAPE.text).toBeGreaterThan(CARD_SHAPE.text * 1.8);
  });

  it("keeps `10` inside the card's width", () => {
    const { width, text, pad } = LARGE_CARD_SHAPE;
    expect(text * RANK_EM).toBeLessThan(width - pad * 2);
  });

  it("keeps the rank and its suit inside the card's height", () => {
    const { text, pad } = LARGE_CARD_SHAPE;
    expect(text * STACK_EM).toBeLessThan(1 - pad * 2);
  });

  /** What the issue asks for: as large as will fit. A face with room to spare at
   * this size is one that could have been bigger. */
  it("has no room left worth having", () => {
    const { text, pad } = LARGE_CARD_SHAPE;
    expect(text * STACK_EM).toBeGreaterThan((1 - pad * 2) * 0.85);
  });

  /** The trap #323 names, made executable: the obvious way to do this is to
   * leave `CARD_SHAPE` alone and ask for a bigger rank, and half a card's height
   * with the ordinary padding spills — silently, because the card is
   * `overflow-hidden`. So the fractions are their own set. */
  it("spills at the rank the issue floated, on the ordinary padding", () => {
    expect(0.5 * STACK_EM).toBeGreaterThan(1 - CARD_SHAPE.pad * 2);
    expect(LARGE_CARD_SHAPE.text * STACK_EM).toBeLessThan(1 - LARGE_CARD_SHAPE.pad * 2);
  });
});

describe("which floors move and which do not", () => {
  it("scales nothing at all when large print is off", () => {
    expect(printScale(false)).toBe(1);
    expect(printScale(true)).toBe(LARGE_SCALE);
  });

  /** A thumb is the same width whatever size the cards are, so the tap floors
   * are the two numbers large print may not touch. `handStep` takes `tightest`
   * from its caller precisely so the scale cannot reach it. */
  it("leaves the tap floor where it is", () => {
    const wide = CARD_WIDTH_PX.md * LARGE_SCALE;
    // A hand far too big for the row, so the search bottoms out.
    const step = handStep(300, 20, wide, undefined, false, LARGE_SCALE);
    expect(step).toBe(TIGHTEST);
    expect(handStep(300, 20, CARD_WIDTH_PX.md)).toBe(TIGHTEST);
  });

  it("leaves the picker's tap floor where it is", () => {
    const step = handStep(200, 20, CARD_WIDTH_PX.sm * LARGE_SCALE, PICKER_TIGHTEST, false, LARGE_SCALE);
    expect(step).toBe(PICKER_TIGHTEST);
  });

  /** Below the tap floor what is left to protect is reading, and that scales
   * with the card: a bigger card squeezed to the same sliver buys nothing. */
  it("scales the floor a fitted hand may be squeezed to", () => {
    const wide = CARD_WIDTH_PX["2xl"] * LARGE_SCALE;
    expect(handStep(wide + 10, 40, wide, undefined, true, LARGE_SCALE)).toBe(
      FIT_TIGHTEST * LARGE_SCALE,
    );
    expect(handStep(CARD_WIDTH_PX["2xl"] + 10, 40, CARD_WIDTH_PX["2xl"], undefined, true)).toBe(
      FIT_TIGHTEST,
    );
  });

  it("scales both ends of the hand's height", () => {
    expect(handHeight(10_000, LARGE_SCALE)).toBe(TALLEST * LARGE_SCALE);
    expect(handHeight(0, LARGE_SCALE)).toBe(SHORTEST * LARGE_SCALE);
    expect(handHeight(10_000)).toBe(TALLEST);
  });

  it("scales the seat strip's floor with the cards when the face has not changed", () => {
    // Seven full hands in a phone's width: nothing fits, so the sliver bottoms out.
    const hands = [12, 12, 12, 12, 12, 12, 12];
    expect(fanTable(320, hands, SEAT_OUT_MIN, LARGE_SCALE).sliver).toBe(
      Math.round(SLIVER_FLOOR * LARGE_SCALE),
    );
    expect(fanTable(320, hands).sliver).toBe(SLIVER_FLOOR);
  });
});

/**
 * The floor a fan may tighten to is about the **face**, not only the card, and
 * that is what large print changes rather than merely scales. A sliver shows a
 * card's left edge; the large face puts about twice the ink there; so the floor
 * is roughly three quarters of a card instead of half of one.
 */
describe("how much of a card has to show", () => {
  it("says nothing about the ordinary face", () => {
    expect(readableSliver(CARD_HEIGHT_PX.sm, false)).toBe(0);
    expect(readableSliver(1000, false)).toBe(0);
  });

  it("is what `10` needs at the large face's size", () => {
    const height = CARD_HEIGHT_PX["2xl"];
    const rank = LARGE_CARD_SHAPE.text * RANK_EM * height;
    const pad = LARGE_CARD_SHAPE.pad * height;
    expect(readableSliver(height, true)).toBeGreaterThanOrEqual(rank + pad);
    // And not extravagantly more than it: a floor is a floor, not a whole card.
    expect(readableSliver(height, true)).toBeLessThan(rank + pad + 8);
  });

  it("comes to about three quarters of a card, against the ordinary face's half", () => {
    const height = CARD_HEIGHT_PX.sm * LARGE_SCALE;
    const width = CARD_WIDTH_PX.sm * LARGE_SCALE;
    expect(readableSliver(height, true) / width).toBeGreaterThan(0.65);
    expect(readableSliver(height, true) / width).toBeLessThan(0.8);
    expect(SLIVER_FLOOR / CARD_WIDTH_PX.sm).toBeCloseTo(0.55, 2);
  });

  it("floors the seat strip instead of the scaled 22 once the face changes", () => {
    const hands = [12, 12, 12, 12, 12, 12, 12];
    const large = fanTable(320, hands, SEAT_OUT_MIN * LARGE_SCALE, LARGE_SCALE, true).sliver;
    expect(large).toBe(readableSliver(CARD_HEIGHT_PX.sm * LARGE_SCALE, true));
    expect(large).toBeGreaterThan(Math.round(SLIVER_FLOOR * LARGE_SCALE));
  });

  /** It outranks the thumb, which is the one place large print changes what
   * `handStep` does rather than how big its numbers are. */
  it("outranks the tap floor in the hand", () => {
    const height = CARD_HEIGHT_PX.md * LARGE_SCALE;
    const width = CARD_WIDTH_PX.md * LARGE_SCALE;
    const readable = readableSliver(height, true);
    expect(readable).toBeGreaterThan(TIGHTEST);
    expect(handStep(300, 20, width, undefined, false, LARGE_SCALE, readable)).toBe(readable);
  });

  /** And it outranks `fit`, so a hand scrolls rather than closing up past the
   * point its ranks can be read — the release valve, and the same call `fan.ts`
   * makes with rows. */
  it("outranks the fitted floor too, so the row scrolls instead", () => {
    const height = CARD_HEIGHT_PX["2xl"] * LARGE_SCALE;
    const width = CARD_WIDTH_PX["2xl"] * LARGE_SCALE;
    const readable = readableSliver(height, true);
    const step = handStep(width + 10, 40, width, undefined, true, LARGE_SCALE, readable);
    expect(step).toBe(readable);
    expect(handWidth(40, step, width)).toBeGreaterThan(width + 10);
  });

  it("leaves the ordinary face's hand exactly where it was", () => {
    for (const cards of [2, 6, 12, 20]) {
      expect(handStep(828, cards, CARD_WIDTH_PX["2xl"], undefined, true, 1, 0)).toBe(
        handStep(828, cards, CARD_WIDTH_PX["2xl"], undefined, true),
      );
    }
  });
});

describe("large print is the same layout, scaled", () => {
  /** `stripWidth` is linear in the scale, which is what makes the strip in large
   * print the strip it always was on a screen that much wider — rather than a
   * different arrangement that happens to fit. */
  it("measures a strip at exactly the scale it was given", () => {
    const hands = [5, "out" as const, 9, 2];
    for (const sliver of [30, 40]) {
      expect(stripWidth(hands, sliver * LARGE_SCALE, SEAT_OUT_MIN * LARGE_SCALE, LARGE_SCALE)).toBeCloseTo(
        stripWidth(hands, sliver, SEAT_OUT_MIN) * LARGE_SCALE,
        6,
      );
    }
  });

  it("fans a scaled strip on a scaled screen the way it fans the plain one", () => {
    const hands = [3, 7, 4, 6];
    for (const available of [360, 640, 900]) {
      const plain = fanTable(available, hands).sliver;
      const large = fanTable(
        available * LARGE_SCALE,
        hands,
        SEAT_OUT_MIN * LARGE_SCALE,
        LARGE_SCALE,
      ).sliver;
      // Within a pixel and a half: the search steps in whole pixels at both
      // sizes, and a whole pixel is a smaller step once everything is 1.3× bigger.
      expect(Math.abs(large - plain * LARGE_SCALE)).toBeLessThanOrEqual(2);
    }
  });
});
