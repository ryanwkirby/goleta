import { useMemo } from "react";

import { qrSymbol } from "../lib/qr.ts";

/**
 * The room, as something you hold up.
 *
 * SVG rather than canvas: it scales to whatever it is given — a phone held
 * across a table here, half a television in #14 — stays crisp at both, takes
 * the table's own colours, and needs no ref and no paint timing.
 *
 * White ground, felt-dark modules. A scanner wants light behind dark and a
 * quiet zone around it, and the felt is neither, so the code brings its own
 * card to sit on rather than being drawn onto the table. `crispEdges` keeps the
 * module grid off the half-pixel: antialiased edges are what turns a small
 * symbol into one that has to be hunted for.
 */
export function QrCode({
  value,
  label,
  className = "",
}: {
  value: string;
  /** What a screen reader is told this is. The code itself is in the text. */
  label: string;
  className?: string;
}) {
  const { side, path } = useMemo(() => qrSymbol(value), [value]);

  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className={["h-auto w-full rounded-xl bg-white", className].join(" ")}
    >
      <path d={path} fill="var(--color-felt-950)" />
    </svg>
  );
}
