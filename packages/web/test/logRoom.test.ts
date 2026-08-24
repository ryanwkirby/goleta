import { describe, expect, it } from "vitest";

import { LOG_MIN_LIST, logList } from "../src/lib/logRoom.ts";

/** The column measured on a 390x844 phone, mid-game, with the log collapsed:
 * the piles are sitting in 233px of felt they are not using. */
const SLACK = 233;

describe("logList", () => {
  it("offers the felt the piles are not using", () => {
    expect(logList(SLACK)).toBe(SLACK);
  });

  it("never offers less than the list always used to get", () => {
    // A short screen, where the column already overflows and there is no slack
    // anywhere: the page scrolls, exactly as it did before any of this.
    expect(logList(0)).toBe(LOG_MIN_LIST);
    expect(logList(90)).toBe(LOG_MIN_LIST);
    // Negative is a column that has already overrun the screen.
    expect(logList(-140)).toBe(LOG_MIN_LIST);
  });

  it("stays whole, because it is going out as a pixel height", () => {
    expect(Number.isInteger(logList(233.7))).toBe(true);
    expect(logList(233.7)).toBe(233);
  });
});
