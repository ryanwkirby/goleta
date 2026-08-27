import { describe, expect, it } from "vitest";

import { LOG_MIN_LIST, logList } from "../src/lib/logRoom.ts";

/** The column measured on a 390x844 phone, mid-game, with the log collapsed:
 * the piles are sitting in 233px of felt they are not using. */
const SLACK = 233;

/** The three viewports #358 measured in Chrome at 393 wide, mid-game, four
 * seats. The fixed part of the column comes to 591–611px, so the slack is
 * roughly the viewport less six hundred — and every one of these is a phone. */
const MEASURED = [
  { viewport: 734, slack: 123 },
  { viewport: 750, slack: 139 },
  { viewport: 852, slack: 261 },
];

describe("logList", () => {
  it("offers the felt the piles are not using", () => {
    expect(logList(SLACK)).toBe(SLACK);
  });

  it("takes the measurement on every viewport anybody plays this on", () => {
    // The regression #358 is about: with the old 176px floor, the first two of
    // these opened into the constant instead, which is more than the column had
    // — so the page scrolled *and* the list scrolled inside it.
    for (const { viewport, slack } of MEASURED) {
      expect(logList(slack), `viewport ${viewport}`).toBe(slack);
    }
  });

  it("never grows the column, which is what makes the page stay put", () => {
    // The property, stated as arithmetic: above the floor the list is never
    // larger than the room that was already there for it.
    for (const slack of [53, 90, 123, 176, 261, 800]) {
      expect(logList(slack)).toBeLessThanOrEqual(slack);
    }
  });

  it("still opens into two lines when there is no room at all", () => {
    // Where the floor binds it does overflow, and that is the honest answer: no
    // slack means a column that has already used everything the viewport had,
    // and a log that opened into nothing there is a control that does not work.
    expect(logList(0)).toBe(LOG_MIN_LIST);
    expect(logList(40)).toBe(LOG_MIN_LIST);
    // Negative is a column that has already overrun the screen.
    expect(logList(-140)).toBe(LOG_MIN_LIST);
  });

  it("keeps that floor small enough that it is a floor rather than a cap", () => {
    // The whole of what went wrong in #352: a floor above the room a phone has
    // is not a floor, it is the old constant with extra steps.
    expect(LOG_MIN_LIST).toBe(53);
    for (const { slack } of MEASURED) expect(LOG_MIN_LIST).toBeLessThan(slack);
  });

  it("stays whole, because it is going out as a pixel height", () => {
    expect(Number.isInteger(logList(233.7))).toBe(true);
    expect(logList(233.7)).toBe(233);
  });
});
