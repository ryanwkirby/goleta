/**
 * A room code as something you point a camera at.
 *
 * The encoding itself comes from `uqr` — zero dependencies, and hand-rolling
 * one means Reed–Solomon and mask selection for no benefit. What lives here is
 * the part that is ours: turning its matrix into a single SVG path, and
 * deciding how much white sits around it.
 */

import { encode } from "uqr";

/**
 * The quiet zone, in modules. Four is the spec's minimum and the reason to
 * bother having a constant: a QR with nothing around it is a QR that scanners
 * hunt for, and this one is being read across a table off somebody's phone.
 */
export const QUIET_ZONE = 4;

/**
 * The dark modules as one path, rather than a rect apiece.
 *
 * A version-3 symbol is 31×31 and about half of it is dark, so this is the
 * difference between one element and ~480 of them. Each module is drawn as its
 * own closed subpath at integer coordinates, which is what lets the whole thing
 * scale to any size without seams: the renderer is scaling one shape, not
 * tiling hundreds of independently-rounded boxes.
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

/**
 * `ecc: "M"` because this is read off a lit screen at arm's length, not printed
 * on a box and rained on: the payload is ~35 characters, which M keeps inside a
 * version 2–3 symbol, and larger modules scan from further away than a heavier
 * error correction level buys back.
 */
export const qrSymbol = (value: string): QrSymbol => {
  const { size, data } = encode(value, { ecc: "M" });
  return { side: size + QUIET_ZONE * 2, path: qrPath(data) };
};
