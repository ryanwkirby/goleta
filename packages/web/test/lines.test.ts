import { describe, expect, it } from "vitest";

import { lineCount } from "../src/lib/lines.ts";

/**
 * The landing header puts half a line between its two sentences once they have
 * come out at more than two lines (#433), so the count is what decides it and
 * the count is arithmetic.
 */
describe("lineCount", () => {
  it("counts one line per child when nothing has wrapped", () => {
    expect(lineCount([24, 24], 24)).toBe(2);
  });

  it("counts a wrapped child as the lines it took", () => {
    expect(lineCount([24, 48], 24)).toBe(3);
    expect(lineCount([48, 72], 24)).toBe(5);
  });

  it("rounds rather than floors, so a fractional line height still lands", () => {
    expect(lineCount([47.98], 24)).toBe(2);
    expect(lineCount([24.02], 24)).toBe(1);
  });

  it("never counts a child as less than a line", () => {
    // Nothing has been laid out yet. Two sentences are two lines, not none —
    // answering zero would say an unmeasured block is shorter than a measured
    // one and put the gap in before anything had wrapped.
    expect(lineCount([0, 0], 24)).toBe(2);
  });

  it("falls back to one line per child when there is no line height to divide by", () => {
    // `line-height: normal` parses to NaN. The unwrapped answer is the one that
    // changes nothing, which is the right way to be wrong here.
    expect(lineCount([24, 48], Number.NaN)).toBe(2);
    expect(lineCount([24, 48], 0)).toBe(2);
  });

  it("is zero for nothing", () => {
    expect(lineCount([], 24)).toBe(0);
  });
});
