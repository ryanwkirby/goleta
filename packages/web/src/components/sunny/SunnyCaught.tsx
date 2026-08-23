
import type { Card } from "@goleta/engine";

import { isRed, SUIT_GLYPH, SUIT_LABEL } from "../../lib/cardShape.ts";
import { Button } from "../ui.tsx";

/** A card named inline, in the suit's colour, the way the log names it. */
function CardChip({ card }: { card: Card }) {
  return (
    <span
      className={[
        "inline-block rounded px-1 py-px font-semibold tabular-nums",
        "bg-white",
        isRed(card.suit) ? "text-rose-600" : "text-slate-900",
      ].join(" ")}
      aria-label={`${card.rank} of ${SUIT_LABEL[card.suit].toLowerCase()}`}
    >
      <span aria-hidden>
        {card.rank}
        {SUIT_GLYPH[card.suit]}
      </span>
    </span>
  );
}

/**
 * A call rewinds the game, takes two cards off you and hands everyone a new card
 * to match, and until #66 the table narrated none of it: the announcement
 * expired on a timer while the forced play sat one tap away. Only the offender
 * sees it, and it gives nothing away — the play named is one they have already
 * been caught not making.
 */
export function SunnyCaught({
  callerName,
  skipped,
  returned,
  owesPunishment,
  onDone,
}: {
  callerName: string;
  /** The plays that were open to you. Usually one; occasionally a choice. */
  skipped: Card[];
  /** What the rewind took back, and what step three will turn up. */
  returned: Card[];
  /** False when the skipped play is your last card: it eliminates you on the spot,
   * so promising a step that will never come would be its own small lie. */
  owesPunishment: boolean;
  onDone: () => void;
}) {
  const only = skipped.length === 1 ? skipped[0] : null;

  return (
    <div
      role="alertdialog"
      aria-modal
      aria-label="Caught by the Sunny Rule"
      className={[
        "fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center",
        "pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]",
      ].join(" ")}
    >
      <div className="flex w-full max-h-full max-w-md flex-col overflow-hidden rounded-2xl bg-felt-900 ring-1 ring-amber-300/40">
        <div className="overflow-y-auto p-5 pb-4">
          <h2 className="text-xl font-semibold text-amber-300">
            <span aria-hidden>☀️</span> Caught by the Sunny Rule
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            <strong className="text-white">{callerName}</strong> called it on you — and they were
            right. You drew with a card you could have played. Your turn is forfeit; here's what it
            costs.
          </p>

          <ol className="mt-4 space-y-2 text-sm leading-relaxed text-white/80">
            <li className="flex gap-2.5">
              <span className="font-semibold text-amber-300">1.</span>
              <span>
                {only ? (
                  <>
                    Play the <CardChip card={only} /> you skipped.
                  </>
                ) : (
                  "Make the play you skipped — you had more than one."
                )}
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="font-semibold text-amber-300">2.</span>
              <span>
                {owesPunishment
                  ? "Give up a punishment card. Any card — it doesn't have to match."
                  : "That was your last card, so there's no punishment to pay — it puts you out of the game instead."}
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="font-semibold text-amber-300">3.</span>
              <span>
                {returned.length > 0 ? (
                  <>
                    You lose the{" "}
                    {returned.map((card, index) => (
                      <span key={card.id}>
                        {index > 0 ? ", " : null}
                        <CardChip card={card} />
                      </span>
                    ))}{" "}
                    you reached for. {returned.length > 1 ? "They go" : "It goes"} face up, and
                    that's the card everyone matches next.
                  </>
                ) : (
                  "You reached for an empty deck, so there's nothing to turn up. Your punishment card stays in play."
                )}
              </span>
            </li>
          </ol>
        </div>

        <div className="shrink-0 p-5 pt-0">
          <Button variant="primary" full onClick={onDone}>
            Take my penalty
          </Button>
        </div>
      </div>
    </div>
  );
}
