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
 * Both answers name themselves, the shape the lobby's seat-order check already
 * uses. A bare Cancel/OK asks somebody to work out which one is which while
 * looking at a sentence about losing their seat.
 */

import { useState } from "react";

import { Button, Panel } from "./ui.tsx";

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
 */
const cost = (watching: boolean, underWay: boolean): string => {
  if (watching) return "You're watching rather than playing, so there's no seat to give up.";
  if (underWay) {
    return "Your hand stays in the game and plays itself out, so the table can finish — but the seat is gone for good. This browser can't take it back.";
  }
  return "Your seat goes with you, for good. This browser can't take it back.";
};

export function LeaveControl({
  watching,
  underWay,
  onLeave,
  compact = false,
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
          className={[
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
            "text-white/60 transition-colors hover:bg-white/5 hover:text-white",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
            className,
          ].join(" ")}
        >
          <DoorGlyph />
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
        // `z-30` like every other overlay here, so it sits above the turn glow.
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
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
                No, I'll stay
              </Button>
              <Button variant="secondary" className="flex-1" onClick={onLeave}>
                Yes, I'm going
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
