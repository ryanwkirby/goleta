/**
 * A room code as something you point a camera at. The encoding comes from `uqr`;
 * what lives here is turning its matrix into a single SVG path and deciding how
 * much white sits around it.
 */

import { encode } from "uqr";

/** Four is the spec's minimum: a QR with nothing around it is one scanners hunt
 * for, and this is read across a table off somebody's phone. */
export const QUIET_ZONE = 4;

/**
 * The dark modules as one path rather than a rect apiece — one element instead
 * of ~480. Each is a closed subpath at integer coordinates, which is what lets
 * the whole thing scale without seams.
 */
export const qrPath = (matrix: readonly (readonly boolean[])[]): string => {
  const parts: string[] = [];
  for (const [y, row] of matrix.entries()) {
    for (const [x, dark] of row.entries()) {
      if (dark) parts.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return parts.join("");
};

export interface QrSymbol {
  /** The side of the symbol including its quiet zone, in modules. */
  side: number;
  path: string;
}

/** `ecc: "M"` because this is read off a lit screen at arm's length: it keeps a
 * ~35-character payload inside a version 2–3 symbol, and larger modules scan
 * from further away than heavier correction buys back. */
export const qrSymbol = (value: string): QrSymbol => {
  const { size, data } = encode(value, { ecc: "M" });
  return { side: size + QUIET_ZONE * 2, path: qrPath(data) };
};
