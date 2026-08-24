import { useEffect } from "react";

import type { Card } from "@goleta/engine";

import { PlayingCard } from "../Card.tsx";
import { LAYER } from "../../lib/layers.ts";

/**
 * Said out loud to the whole table before anybody gets an explanation: the rule
 * reads very differently once you have seen it land on someone.
 *
 * **A card and a word** (#324). It was two sentences carrying four facts — who
 * called it on whom, which card they named, and whether they were right — and
 * the second of them, *"Said they should have played the 7♣. They were right."*,
 * spelled out a card this app draws everywhere else and turned a verdict into a
 * sentence. The card is drawn now and the verdict is one word.
 *
 * It goes to **everyone**, offender and spectators included, because the verdict
 * is already public in `sunnyCalled.correct` (#63). Nothing here varies with
 * whether the call landed except the word itself: a wrong call is announced in
 * the same shape, in the same place, for the same length of time.
 */
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
        `pointer-events-none fixed inset-x-0 top-0 ${LAYER.overlay} flex justify-center p-4`,
        "pt-[max(1rem,env(safe-area-inset-top))]",
        "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
      ].join(" ")}
    >
      <div className="max-w-md rounded-2xl bg-felt-900 px-5 py-3 text-center shadow-xl ring-1 ring-amber-300/40">
        <p className="text-base font-semibold text-amber-300">
          <span aria-hidden>☀️</span> {callerName} called the Sunny Rule on {targetName}
        </p>
        {/* The card, then the verdict. `PlayingCard` carries its own `aria-label`,
            so a screen reader hears the rank and suit rather than nothing at all.

            Not `mirrored`, deliberately, and for `CardChip`'s reason rather than
            against #332's: this is a card *named in a message on somebody's own
            phone*, not a card at rest on the felt that a table reads from both
            ends. */}
        <div className="mt-2 flex items-center justify-center gap-3">
          <PlayingCard card={card} size="md" />
          <span className="text-lg font-semibold text-white">{correct ? "Right" : "Wrong"}</span>
        </div>
      </div>
    </div>
  );
}
