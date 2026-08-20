import { useMemo, useState } from "react";

import { qrSymbol } from "../lib/qr.ts";

/**
 * The room, as something you hold up. SVG rather than canvas: it scales to a
 * phone across a table or half a television and needs no paint timing. White
 * ground and felt-dark modules, because a scanner wants light behind dark, and
 * `crispEdges` keeps the grid off the half-pixel.
 *
 * **Tapping it copies the link it encodes** (#140) — a QR is a link you cannot
 * select, and every code copies its *own* value. Failure is silent.
 */
/**
 * A QR, at the size of a character. The room code sat on every screen for the
 * whole of every game; #135 gave it a job and #162 gave back the space. Drawn
 * rather than typed — a Unicode square is a gamble on the device's font, and
 * this has to read as *a QR* at three type sizes and again on a television.
 */
export function QrGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 7 7"
      aria-hidden
      shapeRendering="crispEdges"
      fill="currentColor"
      className={["h-[1em] w-[1em]", className].join(" ")}
    >
      {/* The three finder squares, which are what the eye reads as a QR. */}
      <path d="M0 0h3v3H0zM1 1v1h1V1zM4 0h3v3H4zM5 1v1h1V1zM0 4h3v3H0zM1 5v1h1V5z" />
      {/* Enough of a payload not to look like three boxes. */}
      <path d="M4 4h1v1H4zM6 4h1v1H6zM5 5h1v1H5zM4 6h1v1H4zM6 6h1v1H6zM3 1h1v1H3zM3 3h1v1H3zM1 3h1v1H1z" />
    </svg>
  );
}

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
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`${label}. Copies the link.`}
      // A container, so the confirmation over it is sized against the code rather
      // than the root font: the same component is 11rem wide in the lobby and
      // 30rem propped across a room.
      style={{ containerType: "inline-size" }}
      // The card's own classes, moved off the symbol so the padding belongs to the
      // thing being tapped: a quiet zone that isn't part of the target is a ring
      // of misses around the middle of the code. The width comes from the caller
      // and only from the caller — a `w-full` here means "fill the parent", which
      // is 888px of QR in a row.
      className={[
        "relative block h-auto rounded-xl bg-white",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        className,
      ].join(" ")}
    >
      <svg
        viewBox={`0 0 ${side} ${side}`}
        aria-hidden
        shapeRendering="crispEdges"
        className="block h-auto w-full"
      >
        <path d={path} fill="var(--color-felt-950)" />
      </svg>

      {/* Over the code rather than under it: this is a picture with no room
          beneath it on the shared screen. Sized in `cqw`, so it is the same
          fraction of the code at all three sizes. */}
      {copied ? (
        <span
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-felt-950/85 text-center text-[9cqw] font-semibold text-amber-300"
          role="status"
        >
          Link copied
        </span>
      ) : null}
    </button>
  );
}
