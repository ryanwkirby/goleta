import { useEffect } from "react";

import type { Card } from "@goleta/engine";

import { isRed, SUIT_GLYPH, SUIT_LABEL } from "./Card.tsx";
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
 * The sentence a landed call opens with, and the reason this dialog exists.
 *
 * A call rewinds the game, takes two cards off you and hands everyone a new
 * card to match, and until #66 the table narrated none of it: the announcement
 * expired on a timer at the top of the screen while the forced play sat one tap
 * away at the bottom, so the punishment could be half over before its victim
 * knew it had started. Being caught is the loudest thing that happens in this
 * game and it now reads that way — it stops the table, it says who and what and
 * what it will cost, and the hand stays dead until it is dismissed.
 *
 * Only the offender sees it. Everyone else has the announcement banner, which
 * is all a bystander needs.
 *
 * It gives nothing away. The play being named is one the offender has already
 * been caught not making, and the card being turned up is one the whole table
 * watched them draw.
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
  /**
   * False when the skipped play is your last card. It eliminates you on the
   * spot and there is nothing left to pay the punishment with, so promising a
   * step that will never come would be its own small lie.
   */
  owesPunishment: boolean;
  onDone: () => void;
}) {
  const only = skipped.length === 1 ? skipped[0] : null;

  return (
    <div
      role="alertdialog"
      aria-modal
      aria-label="Caught by the Sunny Rule"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-2xl bg-felt-900 p-5 ring-1 ring-amber-300/40">
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

        <Button variant="primary" full className="mt-5" onClick={onDone}>
          Take my medicine
        </Button>
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

/**
 * Naming the suit, without being shut in a box to do it.
 *
 * Deliberately not a modal. Choosing well means counting what everyone else is
 * holding — the whole table is face up for exactly that reason — and an overlay
 * with a scrim over it took the evidence away at the one moment you needed to
 * read it. So it docks to the bottom of the table instead: nothing is covered,
 * the seats still scroll, and it travels with you while you look around.
 *
 * Your own cards aren't tappable during this phase anyway, so there is no move
 * to fumble while it's up.
 */
export function SuitPicker({ onPick }: { onPick: (suit: "C" | "D" | "H" | "S") => void }) {
  const suits = [
    { key: "H", glyph: "♥", label: "Hearts", red: true },
    { key: "D", glyph: "♦", label: "Diamonds", red: true },
    { key: "S", glyph: "♠", label: "Spades", red: false },
    { key: "C", glyph: "♣", label: "Clubs", red: false },
  ] as const;

  return (
    <section
      aria-label="Name a suit"
      className={[
        "sticky bottom-2 z-20 rounded-2xl bg-felt-900/95 p-3 shadow-xl",
        "ring-1 ring-amber-300/40 backdrop-blur",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-amber-300">Name a suit</h2>
        <p className="truncate text-xs text-white/50">
          Take your time — every hand is still up there.
        </p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {suits.map((suit) => (
          <button
            key={suit.key}
            type="button"
            onClick={() => onPick(suit.key)}
            aria-label={suit.label}
            className={[
              "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-white",
              "text-2xl font-semibold shadow-lg transition-transform hover:-translate-y-0.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
              suit.red ? "text-rose-600" : "text-slate-900",
            ].join(" ")}
          >
            <span aria-hidden>{suit.glyph}</span>
            <span className="text-[0.65rem] font-medium text-slate-500">{suit.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
