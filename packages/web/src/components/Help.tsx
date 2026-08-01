/**
 * Asking for a hand, and being seen to ask.
 *
 * The table stops marking up your playable cards once you've finished a game.
 * From then on the highlights are something you request — for one turn, out
 * loud, in front of everybody. That's the deal: help is always there, and
 * taking it is never quiet.
 */

import { Button, Panel } from "./ui.tsx";

/**
 * Appears a few seconds into a turn you haven't moved on. Deliberately quiet:
 * it should read as an offer you can ignore, not a prompt you owe an answer.
 */
export function HelpLink({ onAsk }: { onAsk: () => void }) {
  return (
    <button
      type="button"
      onClick={onAsk}
      className={[
        "self-start rounded-lg px-2 py-1 text-xs text-white/35",
        "transition-colors hover:bg-white/5 hover:text-white/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
      ].join(" ")}
    >
      stuck? ask for a hand
    </button>
  );
}

/** The shout itself, rising off the hand it came from. */
export function HelpShout({ name }: { name?: string }) {
  return (
    <span
      role="status"
      className={[
        "animate-help-shout pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2",
        "whitespace-nowrap rounded-full bg-amber-400 px-2.5 py-1 text-xs font-semibold",
        "text-felt-950 shadow-lg",
      ].join(" ")}
    >
      {name ? `${name}: help!` : "help!"}
    </span>
  );
}

/**
 * The one time the app makes a fuss of you: your first finished game, and the
 * moment the highlights go away. Says what it's taking and what it's leaving.
 */
export function Graduation({ onDone }: { onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <Panel className="w-full max-w-md bg-felt-900 ring-amber-300/30">
        <h2 className="text-xl font-semibold text-amber-300">That's one game down</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          Nicely done. Up to now the table has been dimming the cards you can't play, so your
          move was always the obvious one.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          That stops here. From your next turn the cards all look alike and it's on you to spot
          the match — which also means it's on you to notice when somebody else misses theirs.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          If you get stuck, wait a moment and{" "}
          <strong className="text-white">ask for a hand</strong> — the highlights come back for
          that turn. Everyone at the table will hear you ask.
        </p>
        <Button variant="primary" full className="mt-5" onClick={onDone}>
          Deal me in
        </Button>
      </Panel>
    </div>
  );
}
