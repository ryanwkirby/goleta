import { useMemo, useState } from "react";

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
 *
 * **Tapping it copies the link it encodes** (#140). A QR is a link you cannot
 * select, and the camera is not always the route: the person joining is on the
 * far end of a text message, or the screen being propped up is a laptop you
 * would rather paste into. Every code in the app copies its *own* value, so the
 * join code hands over the join link and the shared-screen code hands over the
 * `/table` one, with no caller left to keep the two in step.
 *
 * The whole card is the button rather than something beside it, because the
 * code is what a finger goes to, and it is where the confirmation lands for the
 * same reason. Failure is silent — an insecure origin has no clipboard, and the
 * code itself is still there to be scanned, which is what it was always for.
 */
/**
 * A QR, at the size of a character.
 *
 * The room code used to sit on every screen for the whole of every game: four
 * characters that said what the room was called, on a strip that is deliberately
 * one line and in a corner of a board where the bands are reserved. #135 gave
 * them a job — tapping them opens the invite — and this keeps the job and gives
 * back the space (#162). The code itself is the first thing on the panel behind
 * it, at reading-out size, so nothing is lost: it goes from permanently on
 * screen to one tap away, which is what a code is worth during a hand.
 *
 * Drawn rather than typed. A Unicode square is a gamble on whatever font the
 * device has, and this has to read as *a QR* at three type sizes and again on a
 * television. Seven modules with three finder squares is the smallest thing
 * that unmistakably is one. `1em`, so it sits on the line like the characters
 * it replaced, and `currentColor`, so it inherits whatever the row is doing.
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
      // A container, so the confirmation over it can be sized against the code
      // rather than against the root font. The same component is 11rem wide in
      // the lobby and 30rem on a screen propped across the room, and one fixed
      // size cannot be right at both — see the overlay below.
      style={{ containerType: "inline-size" }}
      // The card's own classes, moved off the symbol so the padding belongs to
      // the thing being tapped: a quiet zone that isn't part of the target is a
      // ring of misses around the middle of the code.
      //
      // The width comes from the caller and only from the caller. A `w-full` in
      // here reads as "fill the card" and means "fill the parent", which is the
      // same thing in a column and is 888px of QR in a row.
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
          beneath it on the shared screen, and a line that appeared below would
          move whatever the code is sitting in. Sized in `cqw` so it is the same
          fraction of the code at every one of the three sizes this is drawn at. */}
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
