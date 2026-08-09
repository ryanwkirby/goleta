import { describe, expect, it } from "vitest";

import { TABLE_DESIGN, fitScale } from "../src/lib/fitScale.ts";

/** The two ends of the range #14 names: a 10" tablet, and a television. */
const TABLET = { width: 1180, height: 820 };
const TELEVISION = { width: 1920, height: 1080 };

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
