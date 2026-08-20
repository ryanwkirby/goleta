import type { Ref, ReactNode } from "react";

import type { GoletaError } from "../lib/feed.ts";
import { MoveRefusal } from "./Refusal.tsx";
import { SunnyCall } from "./sunny/SunnyCall.tsx";

/**
 * The frame around your own cards: the ring that says the table is waiting on
 * you, and the answer to a move it just refused. A refusal hangs off the top
 * edge of the hand in **both** orientations (#99) — that used to be true because
 * two blocks of JSX matched.
 *
 * On a wrapper rather than on `Hand` itself, which scrolls its own overflow and
 * would trim its own ring.
 */
export function HandFrame({
  mine,
  refusal,
  children,
  ref,
}: {
  /** `waitingOn`, not whose turn it is. */
  mine: boolean;
  refusal: GoletaError | null;
  children: ReactNode;
  /** The upright table measures this element to fit its fan against, so the frame
   * *is* the measured box rather than something inside one. */
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={["relative rounded-2xl transition-colors", mine ? "ring-1 ring-amber-300/60" : ""]
        .join(" ")
        .trimEnd()}
    >
      {refusal ? <MoveRefusal key={refusal.id} error={refusal} /> : null}
      {children}
    </div>
  );
}

/**
 * The way into a Sunny call, over the felt near your own cards. It named a seat
 * in a scrolling strip until #189 — 20px, half a thumb, for the one control
 * whose window shuts when the next player moves. There is only ever one
 * `sunnyTargetId`, so the control names them. 44px, and nowhere near the deck.
 *
 * **Absolute in both layouts**, so it arrives with some presence without moving
 * the cards underneath it. Where it is pinned is the one thing the two callers
 * disagree about: upright, the middle of that box is where `HelpShout` rises.
 */
export function SunnyCallOffer({
  targetName,
  lockedDraws,
  onCall,
  className,
}: {
  targetName: string;
  /** Draws left before you may call again. Visible only to you (#50). */
  lockedDraws: number;
  onCall: () => void;
  /** Where it is pinned. The only thing the two layouts disagree about. */
  className: string;
}) {
  return (
    <div className={`pointer-events-none absolute z-20 flex ${className}`}>
      <SunnyCall
        targetName={targetName}
        lockedDraws={lockedDraws}
        onCall={onCall}
        className="pointer-events-auto"
      />
    </div>
  );
}
