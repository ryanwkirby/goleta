import type { Ref, ReactNode } from "react";

import type { GoletaError } from "../lib/feed.ts";
import { MoveRefusal } from "./Refusal.tsx";

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
