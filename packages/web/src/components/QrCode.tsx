import { useMemo } from "react";

import { useCopyLink } from "../lib/copy.ts";
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
 *
 * **A line drawing at the row's weight, not a filled grid** (#353). It was a
 * solid 7×7 running edge to edge — thirty-two of forty-nine cells, roughly three
 * times the ink of the cog beside it in `TableHeader` and the only one of those
 * four glyphs with no whitespace under it, so it read as heavier *and* a step
 * lower than its neighbours. Same construction as the cog, the book and the door
 * now: a 24 viewBox, `fill="none"`, 1.8 strokes, round caps and joins, with the
 * ink inset to y 4.5 → 19.5 — the band the book and the door already occupy, so
 * the gap under it matches their 3px.
 *
 * The three finder squares are what the eye reads as a QR and outlined they
 * still are. **The payload is the part to spend carefully**: a cell drawn solid
 * is a 3px blob at header size, so there is one hook and one dot rather than the
 * eight cells that were there, and anything added here puts the weight back.
 *
 * **The dial is `1em`, and it belongs to the call sites.** This is drawn at 20px
 * in the header, 14 on the peek strip and 30 on the shared screen, and inset ink
 * is a smaller fraction of the box at each — so a call site that reads too light
 * bumps its own `em`. Don't put the weight back into the drawing to fix a size
 * somewhere else.
 */
export function QrGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["h-[1em] w-[1em]", className].join(" ")}
    >
      {/* The three finder squares, which are what the eye reads as a QR. */}
      <rect x="4.5" y="4.5" width="5" height="5" rx="0.8" />
      <rect x="14.5" y="4.5" width="5" height="5" rx="0.8" />
      <rect x="4.5" y="14.5" width="5" height="5" rx="0.8" />
      {/* Enough of a payload not to look like three boxes, in the one corner a
          QR has no finder in. */}
      <path d="M19.5 15.3h-2.5a1.7 1.7 0 0 0-1.7 1.7v2.5" />
      <path d="M19.5 19.5h.01" />
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
  // The same one copy path the code characters go through (#243): a clipboard
  // that refuses leaves `copied` false, so the confirmation never appears over a
  // copy that did not happen.
  const { copied, copy } = useCopyLink(value);

  return (
    <button
      type="button"
      onClick={copy}
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
