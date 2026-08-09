import { describe, expect, it } from "vitest";

import { encode } from "uqr";

import { QUIET_ZONE, qrPath, qrSymbol } from "../src/lib/qr.ts";

/** The payload the lobby actually prints: an origin plus `#/r/ABCD`. */
const LINK = "https://goleta.ryankirby.net/#/r/ABCD";

describe("a room code as a symbol", () => {
  it("draws one closed subpath per dark module, and nothing for a light one", () => {
    const path = qrPath([
      [true, false],
      [false, true],
    ]);

    expect(path).toBe(`M${QUIET_ZONE} ${QUIET_ZONE}h1v1h-1zM${QUIET_ZONE + 1} ${QUIET_ZONE + 1}h1v1h-1z`);
  });

  it("offsets every module by the quiet zone, so nothing is drawn in it", () => {
    // A single module at the origin lands at (4, 4), not (0, 0) — the border
    // is what a scanner finds the symbol by.
    expect(qrPath([[true]])).toBe(`M${QUIET_ZONE} ${QUIET_ZONE}h1v1h-1z`);
  });

  it("fits a join link into a version 2–3 symbol, quiet zone included", () => {
    const { side, path } = qrSymbol(LINK);

    // Version 2 is 25 modules, version 3 is 29, plus 4 either side.
    expect(side).toBeGreaterThanOrEqual(25 + QUIET_ZONE * 2);
    expect(side).toBeLessThanOrEqual(29 + QUIET_ZONE * 2 + 4);
    expect(path.length).toBeGreaterThan(0);
  });

  it("stays inside its own box", () => {
    const { side, path } = qrSymbol(LINK);
    const coordinates = [...path.matchAll(/M(\d+) (\d+)/g)];

    expect(coordinates.length).toBeGreaterThan(0);
    for (const [, x, y] of coordinates) {
      // `+1` because each module is drawn one unit right and down from here.
      expect(Number(x) + 1).toBeLessThanOrEqual(side - QUIET_ZONE);
      expect(Number(y) + 1).toBeLessThanOrEqual(side - QUIET_ZONE);
      expect(Number(x)).toBeGreaterThanOrEqual(QUIET_ZONE);
      expect(Number(y)).toBeGreaterThanOrEqual(QUIET_ZONE);
    }
  });

  it("draws exactly the modules the encoder marked dark, and no others", () => {
    // The one thing that could quietly ruin a symbol without failing anything
    // else: a path that drops or invents modules still renders as a plausible
    // QR, and simply doesn't scan.
    const { data } = encode(LINK, { ecc: "M" });
    const dark = data.flat().filter(Boolean).length;

    expect([...qrSymbol(LINK).path.matchAll(/h1v1h-1z/g)]).toHaveLength(dark);
  });

  it("gives a different room a different symbol", () => {
    expect(qrSymbol(LINK).path).not.toBe(
      qrSymbol("https://goleta.ryankirby.net/#/r/WXYZ").path,
    );
  });
});
