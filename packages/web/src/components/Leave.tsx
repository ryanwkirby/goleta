/**
 * The way out, and the question before it (#255).
 *
 * At the table it used to be the word **leave**, small and grey, an inch after
 * the word **rules** — two words the same size and colour, one of which opens a
 * panel and one of which drops you out of the game. And it fired instantly.
 *
 * So: a door rather than a word, at the 44px the rest of the app designs to, and
 * a question first. The copy is written to what leaving actually costs, which
 * #256 settled — the seat cannot be handed back, because this browser throws
 * away the token that proved it was yours. Mid-hand the cards do not vanish with
 * it: the autopilot plays them out and the table finishes the game (#202).
 *
 * Both answers name themselves. A bare Cancel/OK asks somebody to work out which
 * one is which while looking at a sentence about losing their seat. **Stay** and
 * **Leave** do that in a third of the width of *No, I'll stay* / *Yes, I'm
 * going*, and they are the words the question is already in (#292).
 *
 * The lobby's seat-order check was cited here as the precedent and is no longer
 * one: its dismissing answer is **Go back**, a direction rather than an answer
 * (#316). That question is a glance at a list; this one is a seat that cannot be
 * handed back, so the rule stays where the stakes are.
 */

import { useState } from "react";

import { Button, headerItem, Panel } from "./ui.tsx";
import { LAYER } from "../lib/layers.ts";

/** A doorway with somebody stepping through it. */
function DoorGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14" />
      <path d="M11 12h8.5M16.5 8.8 19.8 12l-3.3 3.2" />
    </svg>
  );
}

/**
 * What it costs, honestly, for each of the three people who can press it.
 *
 * A watcher is warned about nothing they have, because they have nothing: no
 * seat, and nothing in `localStorage` to forget.
 *
 * Both seated strings used to end "This browser can't take it back", and
 * **"for good" already says it** (#292). That sentence explained the
 * *mechanism* — the token in `localStorage` that proved the seat was yours is
 * thrown away — and somebody deciding whether to stand up needs the cost rather
 * than the mechanism. It was also the sentence most likely to be read as a bug
 * report about the browser. The mid-hand line stays: that the cards keep playing
 * without you is genuinely surprising, and it is what stops somebody thinking
 * they vanish with them.
 */
const cost = (watching: boolean, underWay: boolean): string => {
  if (watching) return "You're watching rather than playing, so there's no seat to give up.";
  if (underWay) {
    return "Your hand stays in the game and plays itself out, so the table can finish — but the seat is gone for good.";
  }
  return "Your seat goes with you, for good.";
};

export function LeaveControl({
  watching,
  underWay,
  onLeave,
  compact = false,
  label,
  className = "",
}: {
  /** No seat, so nothing to warn them about losing. */
  watching: boolean;
  /** A hand is out, which changes what happens to the cards rather than whether
   * the seat comes back. */
  underWay: boolean;
  onLeave: () => void;
  /**
   * The door rather than the word. True at the table, where it sits beside
   * **rules** in a row of small grey print and must not read as its twin; false
   * in the lobby, which is a screen with room, opposite **How to play**, and
   * nothing running.
   */
  compact?: boolean;
  /** The word under the door, in the upright header where all four items carry
   * one (#330). A labelled door is not a licence to drop the dialog: the word
   * *leave* became a door in the first place because two small grey words an inch
   * apart, one of which drops you out of the game, fired instantly (#255). */
  label?: string;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);

  return (
    <>
      {compact ? (
        <button
          type="button"
          aria-label="Leave the table"
          aria-haspopup="dialog"
          title="Leave the table"
          onClick={() => setAsking(true)}
          className={
            label
              ? [headerItem, className].join(" ")
              : [
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                  "text-white/60 transition-colors hover:bg-white/5 hover:text-white",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                  className,
                ].join(" ")
          }
        >
          <DoorGlyph />
          {label ? <span>{label}</span> : null}
        </button>
      ) : (
        <Button
          variant="ghost"
          aria-haspopup="dialog"
          className={className}
          onClick={() => setAsking(true)}
        >
          Leave
        </Button>
      )}

      {asking ? (
        <div
          className={`fixed inset-0 ${LAYER.overlay} flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm`}
          role="dialog"
          aria-modal="true"
          aria-label="Leave the table?"
          onClick={() => setAsking(false)}
        >
          <Panel className="w-full max-w-sm" onClick={(event) => event.stopPropagation()}>
            <p className="text-sm font-semibold text-white">Leave the table?</p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/60">
              {cost(watching, underWay)}
            </p>
            <div className="mt-4 flex gap-2">
              {/* Dismissing changes nothing at all — the seat is exactly as it was. */}
              <Button variant="primary" className="flex-1" onClick={() => setAsking(false)}>
                Stay
              </Button>
              <Button variant="secondary" className="flex-1" onClick={onLeave}>
                Leave
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
