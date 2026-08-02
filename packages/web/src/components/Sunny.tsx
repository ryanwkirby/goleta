import { useEffect } from "react";

import type { Card, SunnyReach } from "@goleta/engine";

import { PlayingCard, SUIT_GLYPH } from "./Card.tsx";
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
 * The sun that sits beside a player you could accuse.
 *
 * One state, and that is the entire point. It appears when a draw is standing
 * and you are free to call, and it means only that: somebody reached for the
 * deck. Whether they were allowed to is on the table in front of you, in their
 * hand, and working it out is the game. Nothing here brightens, ramps or
 * otherwise leaks the answer — see `AGENTS.md`.
 *
 * `lockedDraws` is the one exception, and it isn't about the draw at all: it is
 * your own missed call still being served, and only you ever see it.
 */
export function SunnySign({
  targetName,
  lockedDraws = 0,
  onCall,
  className = "",
}: {
  targetName?: string;
  lockedDraws?: number;
  onCall?: () => void;
  className?: string;
}) {
  const locked = lockedDraws > 0;
  const label = locked
    ? `Your last call missed — ${lockedDraws} more ${lockedDraws === 1 ? "draw" : "draws"} before you can call again`
    : `Call the Sunny Rule on ${targetName ?? "them"}`;

  return (
    <button
      type="button"
      onClick={locked ? undefined : onCall}
      disabled={locked}
      title={label}
      aria-label={label}
      className={[
        "block h-5 w-5 rounded-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        locked
          ? "cursor-not-allowed text-white/15"
          : "text-white/40 hover:text-white/70",
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
  card,
  correct,
  onDone,
  ms,
}: {
  callerName: string;
  targetName: string;
  /** The card they named. An accusation is specific, so the table hears which. */
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
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]"
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
          Calling it means <strong className="text-white">naming the card</strong>. You tap the sun,
          then tap the card in their hand you say they should have played — the hand as it was
          before they reached, so nothing they drew since is on offer.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          Get it right and they make the play they were dodging after all, then play a second card
          from their hand as a punishment — any card, it doesn't have to match. The card they
          reached for gets turned face up on top, and that's the card everyone has to match next.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          Get it wrong and nobody loses a card — but you can't call again for three draws. Nothing
          on this screen will ever tell you whether you're right. That's what the face-up hands are
          for.
        </p>
        <Button variant="primary" full className="mt-5" onClick={onDone}>
          Understood
        </Button>
      </div>
    </div>
  );
}

/**
 * Naming the card, which is what a Sunny call now is.
 *
 * Docked rather than modal, for the same reason the suit picker is: the whole
 * table is face up because you are meant to be reading it, and a scrim over the
 * evidence at the exact moment you need it was the wrong trade. This one has a
 * second reason too — the cards it lists are the offender's hand *as it was*,
 * and being able to compare that against the pile and against what they hold
 * now, without anything covered, is the entire judgement being asked of you.
 *
 * Deliberately unhelpful: every card is offered at equal weight. Which of them
 * was legal is exactly the question, and dimming the ones that weren't would
 * answer it.
 */
export function SunnyAccusePicker({
  targetName,
  reach,
  onPick,
  onCancel,
}: {
  targetName: string;
  reach: SunnyReach;
  onPick: (cardId: string) => void;
  onCancel: () => void;
}) {
  return (
    <section
      aria-label={`Name the card ${targetName} should have played`}
      className={[
        "sticky bottom-2 z-20 rounded-2xl bg-felt-900/95 p-3 shadow-xl",
        "ring-1 ring-amber-300/40 backdrop-blur",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-amber-300">
          <span aria-hidden>☀️</span> What should {targetName} have played?
        </h2>
        <Button variant="ghost" className="-my-1 px-2 py-1 text-xs" onClick={onCancel}>
          never mind
        </Button>
      </div>
      <p className="mt-1 text-xs text-white/50">
        Their hand as it was when they reached. Get it wrong and you can't call again for three
        draws.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {reach.hand.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            size="md"
            onClick={() => onPick(card.id)}
            title={`Accuse them of skipping the ${card.rank}${SUIT_GLYPH[card.suit]}`}
          />
        ))}
      </div>
    </section>
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
