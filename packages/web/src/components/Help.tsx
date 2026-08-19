/**
 * Asking for a hand, and being seen to ask.
 *
 * The table stops marking up your playable cards once you've finished a game.
 * From then on the highlights are something you request — for one turn, out
 * loud, in front of everybody. That's the deal: help is always there, and
 * taking it is never quiet.
 */

import { Button } from "./ui.tsx";

/**
 * Appears a few seconds into a turn you haven't moved on. Deliberately quiet:
 * it should read as an offer you can ignore, not a prompt you owe an answer.
 *
 * Quiet is not the same as silent, and until #193 this was the second one. It
 * arrived the way a `null` becomes an element — instantly, fully formed, in
 * small grey type at the edge of a screen somebody is already staring at — at
 * the exact moment they have stopped knowing what to do. So it fades in and
 * rises a quarter of a rem into the place it was always going to occupy:
 * enough to be caught in the corner of an eye that is on the cards, not enough
 * to ask for one.
 *
 * Three things the animation is careful about, all of them in `index.css`.
 * **Nothing around it moves** — the rise is a transform inside its own box, and
 * both rows it sits in reserve their room whether or not it is showing.
 * **It does not re-run**: the element is mounted when the offer opens and
 * unmounted when it closes, so the animation has exactly one life per offer.
 * And **it leaves without one** — the offer expires because you moved, and an
 * app that animated that would be commenting on your turn.
 */
export function HelpLink({ onAsk }: { onAsk: () => void }) {
  return (
    <button
      type="button"
      onClick={onAsk}
      // `shrink-0` rather than `self-start`: both rows it sits in centre their
      // items, and one of them is the peek strip, where an offer that gave up
      // its own width to a long prompt would be a tap target squeezed to a
      // sliver of itself.
      className={[
        "animate-help-offer shrink-0 rounded-lg px-2 py-1 text-xs text-white/35",
        "transition-colors hover:bg-white/5 hover:text-white/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
      ].join(" ")}
    >
      want help?
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
 * The same shout, in a line of furniture rather than over a hand.
 *
 * Taking help is never quiet — that is the whole deal — but the two screens
 * that draw nobody else's cards had nothing for somebody else's ask to rise
 * off, so it landed nowhere and an IRL table full of landscape phones was the
 * one place where help was silent. It goes in the peek strip and on the shared
 * table screen instead, which is where each of those views keeps the facts that
 * belong to the whole table.
 *
 * It takes a name where it is drawn on its own — a shout with no name is no use
 * in a strip that isn't next to anybody's seat — and goes without one where it
 * is already sat beside the person who made it. Same amber as the seat's, and
 * no rise: there is nothing here to rise off, and a pill sliding around a 40px
 * strip is motion describing nothing.
 */
export function HelpAsk({ name, className = "" }: { name?: string; className?: string }) {
  return (
    <span
      role="status"
      className={[
        "shrink-0 whitespace-nowrap rounded-full bg-amber-400 px-2 py-0.5 font-semibold",
        "text-felt-950",
        className,
      ].join(" ")}
    >
      {name ? `${name}: help!` : "help!"}
    </span>
  );
}

/**
 * Your first finished game, and the moment the highlights go away.
 *
 * Two sentences. It used to be four paragraphs explaining a change you were
 * about to notice on your very next turn anyway — and it only appears at all if
 * you took the training wheels in the first place. Nothing is being taken from
 * somebody who never had them.
 */
export function Graduation({ onDone }: { onDone: () => void }) {
  return (
    <div
      className={[
        "fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center",
        "pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]",
      ].join(" ")}
    >
      <div className="flex w-full max-h-full max-w-md flex-col overflow-hidden rounded-2xl bg-felt-900 ring-1 ring-amber-300/30">
        <div className="overflow-y-auto p-5 pb-4">
          <h2 className="text-xl font-semibold text-amber-300">Nice one</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Now you've got the hang of the basics, we'll stop showing you which of your cards are
            playable. Help's still there whenever you want it — just ask.
          </p>
        </div>
        <div className="shrink-0 p-5 pt-0">
          <Button variant="primary" full onClick={onDone}>
            Deal me in
          </Button>
        </div>
      </div>
    </div>
  );
}
