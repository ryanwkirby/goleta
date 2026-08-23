import { describe, expect, it } from "vitest";

import {
  TABLE_DESIGN,
  designPoint,
  fitScale,
  shouldTurn,
  turned,
} from "../src/lib/fitScale.ts";

/** The two ends of the range #14 names: a 10" tablet, and a television. */
const TABLET = { width: 1180, height: 820 };
const TELEVISION = { width: 1920, height: 1080 };

/**
 * A phone standing in for a spare tablet, both ways up, with an address bar
 * taking its cut. The numbers are an iPhone's; the point is the shape of them.
 */
const PHONE_SIDEWAYS = { width: 734, height: 320 };
const PHONE_UPRIGHT = { width: 393, height: 659 };

const fits = (box: { width: number; height: number }): boolean => {
  const scale = fitScale(box);
  return (
    TABLE_DESIGN.width * scale <= box.width + 0.001 &&
    TABLE_DESIGN.height * scale <= box.height + 0.001
  );
};

describe("fitting the table screen to whatever it is propped on", () => {
  it("fits the board whole at every size, so nothing is ever cropped", () => {
    // No scrolling and nobody standing at it to scroll: a board with its edge
    // off the screen simply loses that edge for the length of the game.
    for (const box of [TABLET, TELEVISION, { width: 1024, height: 768 }, { width: 800, height: 480 }]) {
      expect(fits(box)).toBe(true);
    }
  });

  it("takes the tighter of the two axes", () => {
    // Wide and short: the height binds.
    expect(fitScale({ width: 4000, height: 560 })).toBe(1);
    // Tall and narrow: the width binds.
    expect(fitScale({ width: 1000, height: 4000 })).toBe(1);
  });

  it("scales up without a ceiling, because a television is the point", () => {
    expect(fitScale(TELEVISION)).toBeGreaterThan(1.9);
    expect(fitScale(TABLET)).toBeGreaterThan(1.1);
  });

  it("gives every screen the same picture, only larger or smaller", () => {
    // One scale for both axes — the proportions are decided once, in the
    // design, rather than recomposing themselves at every aspect ratio.
    const wide = fitScale({ width: 2000, height: 1120 });
    const same = fitScale({ width: 1000, height: 560 });
    expect(wide).toBe(same * 2);
  });

  it("renders at its design size before anything has been measured", () => {
    expect(fitScale({ width: 0, height: 0 })).toBe(1);
    expect(fitScale({ width: 1000, height: 0 })).toBe(1);
  });
});

describe("turning the board a quarter to fit the screen it is on", () => {
  it("leaves a screen already the right way round alone", () => {
    // A tablet or a television propped facing a table is turned the long way,
    // the same way the design is. Nothing to gain, so nothing happens.
    expect(shouldTurn(TABLET)).toBe(false);
    expect(shouldTurn(TELEVISION)).toBe(false);
    expect(shouldTurn(PHONE_SIDEWAYS)).toBe(false);
  });

  it("turns the board on an upright screen, where it fits better sideways", () => {
    expect(shouldTurn(PHONE_UPRIGHT)).toBe(true);
    expect(fitScale(turned(PHONE_UPRIGHT))).toBeGreaterThan(fitScale(PHONE_UPRIGHT));
  });

  it("is why the nudge asks for a phone to be stood upright", () => {
    // The whole argument for asking anybody to turn a device over: an upright
    // phone with the board turned a quarter beats the same phone held sideways,
    // because the address bar takes a far bigger bite out of the short side.
    expect(fitScale(turned(PHONE_UPRIGHT))).toBeGreaterThan(fitScale(PHONE_SIDEWAYS));
    // And it is worth having — the board upright and *not* turned is the worst
    // of the three, which is what this exists to avoid rather than settle for.
    expect(fitScale(PHONE_UPRIGHT)).toBeLessThan(fitScale(PHONE_SIDEWAYS));
  });

  it("still fits whole once turned, in the box it was actually given", () => {
    const scale = fitScale(turned(PHONE_UPRIGHT));
    // Turned, the design's width runs down the screen and its height across.
    expect(TABLE_DESIGN.width * scale).toBeLessThanOrEqual(PHONE_UPRIGHT.height + 0.001);
    expect(TABLE_DESIGN.height * scale).toBeLessThanOrEqual(PHONE_UPRIGHT.width + 0.001);
  });

  it("does not turn anything before there is a screen to measure", () => {
    // The observer corrects this in the same frame, and a board that flipped
    // on its way to being measured would be a visible lurch on every load.
    expect(shouldTurn({ width: 0, height: 0 })).toBe(false);
  });
});

/**
 * A pointer on the shared screen, back in design coordinates (#201).
 *
 * The board carries one transform about its own centre, which is what makes this
 * arithmetic rather than a matrix read off the DOM.
 */
describe("a pointer on the board", () => {
  const centre = { x: 500, y: 300 };
  const middle = { x: TABLE_DESIGN.width / 2, y: TABLE_DESIGN.height / 2 };

  it("puts the middle of the element at the middle of the design", () => {
    expect(designPoint(centre, centre, 1, false)).toEqual(middle);
    expect(designPoint(centre, centre, 0.4, false)).toEqual(middle);
    expect(designPoint(centre, centre, 0.4, true)).toEqual(middle);
  });

  it("undoes the scale", () => {
    // 100 client pixels right of centre at ×0.5 is 200 design pixels right.
    expect(designPoint({ x: 600, y: 300 }, centre, 0.5, false)).toEqual({
      x: middle.x + 200,
      y: middle.y,
    });
  });

  it("undoes the quarter turn", () => {
    // The board is turned +90°, so the design's +x runs *down* the screen.
    expect(designPoint({ x: 500, y: 400 }, centre, 1, true)).toEqual({
      x: middle.x + 100,
      y: middle.y,
    });
    expect(designPoint({ x: 600, y: 300 }, centre, 1, true)).toEqual({
      x: middle.x,
      y: middle.y - 100,
    });
  });

  it("answers something sane for a board with no size yet", () => {
    expect(designPoint({ x: 0, y: 0 }, centre, 0, false)).toEqual(middle);
  });
});
