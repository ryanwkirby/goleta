import type { Ref, ReactNode } from "react";

import type { GoletaError } from "../lib/feed.ts";
import { MoveRefusal } from "./Refusal.tsx";
import { SunnyCall } from "./Sunny.tsx";

/**
 * The frame around your own cards: the ring that says the table is waiting on
 * you, and the answer to a move it just refused.
 *
 * Both layouts drew this from their own copy of the same markup, which is one
 * copy too many for a rule `AGENTS.md` states outright: a refusal hangs off the
 * top edge of the hand in **both** orientations, so turning the phone never
 * moves where the answer appears (#99). That was true because two blocks of JSX
 * happened to match. Now it is true because there is one of them.
 *
 * It is on a wrapper rather than on `Hand` itself: that element scrolls its own
 * overflow, and a box that clips one axis clips both, so it would trim its own
 * ring.
 *
 * The refusal is keyed on the error's id so a second refusal in the same words
 * is a second answer rather than a pill that never moved.
 */
export function HandFrame({
  mine,
  refusal,
  children,
  ref,
}: {
  /** The table is waiting on you — `waitingOn`, not whose turn it is. */
  mine: boolean;
  refusal: GoletaError | null;
  children: ReactNode;
  /**
   * The upright table measures this element to fit its fan against, so the
   * frame *is* the measured box rather than something inside one — an inset
   * here and an inset in the arithmetic are two places to disagree.
   */
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
 * The way into a Sunny call, over the felt near your own cards.
 *
 * It named a seat in a scrolling strip until #189 — a 20px circle wedged
 * between somebody's name and their card count, half a thumb wide, for the one
 * control in this app whose window shuts when the next player moves. A missed
 * tap was usually a missed call.
 *
 * There is only ever one `sunnyTargetId`, so the control names them — *call it
 * on Angela* — which is what stops a call being a thing you do to a name in a
 * list. It is 44px in both layouts, over the felt near your own cards in both,
 * and nowhere near the draw pile in either: a fat target beside the deck is a
 * mis-tap into the exact violation it accuses.
 *
 * **Absolute in both**, so it arrives with some presence without moving the
 * cards underneath it. With a wide fan it sits over a corner of the outermost
 * card, which is the cost the two bottom corners already pay (#167) and a
 * cheaper one here, since a window is only ever open on somebody else's turn.
 *
 * Where it is pinned is the one thing that differs, so `className` is the one
 * prop the two callers disagree about: upright it sits above the hand and left
 * of centre, because the middle of that box is where your own `HelpShout`
 * rises; in landscape it hangs under the strip at the far end from the deck.
 *
 * Tapping it opens the picker and does not call. An accusation names a card, so
 * the tap that starts one cannot be the tap that commits it.
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
