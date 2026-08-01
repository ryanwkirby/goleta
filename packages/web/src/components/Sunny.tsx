import { useEffect } from "react";

import { Button } from "./ui.tsx";

/** A plain outline. It is furniture until it has something to say. */
function SunGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="h-full w-full"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </svg>
  );
}

/**
 * The sun that sits beside the player a call would land on.
 *
 * It exists only while there is somebody to accuse, so seeing one always means
 * the same thing. Two states, and the difference between them is the whole
 * feature:
 *
 *   - `callable` — a draw is standing and you may accuse. Says nothing about
 *     whether you'd be right.
 *   - `telling` — the draw *was* illegal. The glow ramps from barely-there to
 *     unmissable over ten seconds, so a player watching the table still beats
 *     one who isn't; they just no longer have to be right to be quick. This is
 *     a deliberate departure from the old "the server never says" rule, and it
 *     is written down in `AGENTS.md`.
 */
export function SunnySign({
  state,
  targetName,
  onCall,
  className = "",
}: {
  state: "callable" | "telling";
  targetName?: string;
  onCall?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onCall}
      title={`Call the Sunny Rule on ${targetName ?? "them"}`}
      aria-label={`Call the Sunny Rule on ${targetName ?? "them"}`}
      className={[
        "block h-5 w-5 rounded-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        state === "telling" ? "animate-sunny-tell text-amber-300" : "text-white/40 hover:text-white/70",
        className,
      ].join(" ")}
    >
      <SunGlyph />
    </button>
  );
}

/**
 * Who called it on whom, said out loud to the whole table before anybody gets
 * an explanation. The rule reads very differently once you've seen it land on
 * someone, so the news comes first and the lesson second.
 */
export function SunnyAnnounce({
  callerName,
  targetName,
  correct,
  onDone,
  ms,
}: {
  callerName: string;
  targetName: string;
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
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <div className="max-w-md rounded-2xl bg-felt-900 px-5 py-3 text-center shadow-xl ring-1 ring-amber-300/40">
        <p className="text-base font-semibold text-amber-300">
          <span aria-hidden>☀️</span> {callerName} called the Sunny Rule on {targetName}
        </p>
        <p className="mt-0.5 text-sm text-white/60">
          {correct ? "And they were right." : "And they were wrong."}
        </p>
      </div>
    </div>
  );
}

/**
 * Shown the first time the rule touches you — which is how you're meant to
 * learn it. It is deliberately left out of the joining explainer, and it waits
 * behind the announcement above so you know what you're being taught about.
 */
export function SunnyExplainer({ onDone }: { onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-felt-900 p-5 ring-1 ring-amber-300/30">
        <h2 className="text-xl font-semibold text-amber-300">☀️ The Sunny Rule</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          Nobody told you about this one on the way in. Here it is.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          If you take a card from the deck when you had a card you could have played, anyone else
          can call <strong className="text-white">Sunny Rule</strong> on you.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          Get caught and you make the play you were dodging after all, then play a second card
          from your hand as a punishment — any card, it doesn't have to match. The card you
          reached for gets turned face up on top, and that's the card everyone has to match next.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          Calling it when they were innocent costs you a card instead, buried at the bottom of the
          pile. Accusations aren't free.
        </p>
        <Button variant="primary" full className="mt-5" onClick={onDone}>
          Understood
        </Button>
      </div>
    </div>
  );
}

export function SuitPicker({ onPick }: { onPick: (suit: "C" | "D" | "H" | "S") => void }) {
  const suits = [
    { key: "H", glyph: "♥", label: "Hearts", red: true },
    { key: "D", glyph: "♦", label: "Diamonds", red: true },
    { key: "S", glyph: "♠", label: "Spades", red: false },
    { key: "C", glyph: "♣", label: "Clubs", red: false },
  ] as const;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-felt-900 p-5 ring-1 ring-white/15">
        <h2 className="text-center text-lg font-semibold text-white">Name a suit</h2>
        <p className="mt-1 text-center text-sm text-white/60">
          The next player has to match it. Pick one you don't hold.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {suits.map((suit) => (
            <button
              key={suit.key}
              type="button"
              onClick={() => onPick(suit.key)}
              className={[
                "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl bg-white",
                "text-3xl font-semibold shadow-lg transition-transform hover:-translate-y-0.5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
                suit.red ? "text-rose-600" : "text-slate-900",
              ].join(" ")}
            >
              <span aria-hidden>{suit.glyph}</span>
              <span className="text-xs font-medium text-slate-500">{suit.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
