import { useEffect } from "react";

import type { Card } from "@goleta/engine";

import { SUIT_GLYPH } from "../../lib/cardShape.ts";

/** Said out loud to the whole table before anybody gets an explanation: the rule
 * reads very differently once you have seen it land on someone. */
export function SunnyAnnounce({
  callerName,
  targetName,
  card,
  correct,
  onDone,
  ms,
}: {
  callerName: string;
  targetName: string;
  /** An accusation is specific, so the table hears which. */
  card: Card;
  correct: boolean;
  onDone: () => void;
  ms: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [onDone, ms]);

  return (
    <div
      role="status"
      // The one announcement nobody may miss, so it clears the island at both ends as
      // well as the top.
      className={[
        "pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center p-4",
        "pt-[max(1rem,env(safe-area-inset-top))]",
        "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
      ].join(" ")}
    >
      <div className="max-w-md rounded-2xl bg-felt-900 px-5 py-3 text-center shadow-xl ring-1 ring-amber-300/40">
        <p className="text-base font-semibold text-amber-300">
          <span aria-hidden>☀️</span> {callerName} called the Sunny Rule on {targetName}
        </p>
        <p className="mt-0.5 text-sm text-white/60">
          Said they should have played the{" "}
          <span className="font-semibold text-white/80">
            {card.rank}
            {SUIT_GLYPH[card.suit]}
          </span>
          . {correct ? "They were right." : "They were wrong."}
        </p>
      </div>
    </div>
  );
}
