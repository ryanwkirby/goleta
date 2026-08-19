/**
 * Asking for a hand, and being seen to ask.
 *
 * The table stops marking up your playable cards once you've finished a game.
 * From then on the highlights are something you request — for one turn, out
 * loud, in front of everybody. That's the deal: help is always there, and
 * taking it is never quiet.
 */

import type { ShoutKind } from "@goleta/engine";

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

/**
 * What a shout says, which depends on which kind it is.
 *
 * `help` is one turn's worth, asked for and gone. `hints` is the standing state
 * being switched on, announced once — after which the seat carries a mark for
 * as long as it lasts, so the shout does not have to keep saying it.
 */
const SHOUTED: Record<ShoutKind, string> = {
  help: "help!",
  hints: "hints on",
};

const shoutText = (kind: ShoutKind, name?: string): string =>
  name ? `${name}: ${SHOUTED[kind]}` : SHOUTED[kind];

/**
 * Who is shouting what, for the three surfaces that draw somebody else's.
 *
 * A map rather than a set, which it was until #187 added a second kind of
 * shout: a seat strip that knew *that* somebody had said something but not
 * *what* would have to pick one wording and be wrong half the time.
 */
export const shoutingNow = (shouts: readonly { playerId: string; kind: ShoutKind }[]) =>
  new Map(shouts.map((shout) => [shout.playerId, shout.kind]));

/**
 * The standing mark a seat carries while its cards are marked up (#187).
 *
 * Not the same thing as a shout and deliberately quieter: the shout is the
 * moment it was switched on, and this is the state, which lasts. It has to be
 * legible on a seat strip, on a shared screen across a room, and beside a name
 * at every size — so it is one glyph and a label nothing has to read aloud
 * twice.
 */
export function HintedMark({ name, className = "" }: { name?: string; className?: string }) {
  const label = name ? `${name} is playing with hints on` : "Playing with hints on";
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={[
        "shrink-0 rounded-full bg-amber-300/20 px-1.5 font-semibold text-amber-200",
        className,
      ].join(" ")}
    >
      <span aria-hidden>◉</span>
    </span>
  );
}

/** The shout itself, rising off the hand it came from. */
export function HelpShout({ name, kind = "help" }: { name?: string; kind?: ShoutKind }) {
  return (
    <span
      role="status"
      className={[
        "animate-help-shout pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2",
        "whitespace-nowrap rounded-full bg-amber-400 px-2.5 py-1 text-xs font-semibold",
        "text-felt-950 shadow-lg",
      ].join(" ")}
    >
      {shoutText(kind, name)}
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
export function HelpAsk({
  name,
  kind = "help",
  className = "",
}: {
  name?: string;
  kind?: ShoutKind;
  className?: string;
}) {
  return (
    <span
      role="status"
      className={[
        "shrink-0 whitespace-nowrap rounded-full bg-amber-400 px-2 py-0.5 font-semibold",
        "text-felt-950",
        className,
      ].join(" ")}
    >
      {shoutText(kind, name)}
    </span>
  );
}

/**
 * Whether the table marks up your playable cards, as a switch you can find.
 *
 * Two named answers rather than an On/Off beside a sentence — the shape
 * `IrlToggle` and `DealerPicker` already use, and for the same reason: a
 * question with two real answers should say both out loud.
 *
 * **The copy says it is public, because it is** (#187). Switching it on is
 * announced to the table and marks your seat for as long as it lasts, and a
 * player deciding here is entitled to know that before they decide rather than
 * to discover it when everybody looks up. Switching it off is silent and the
 * copy does not promise otherwise: giving up an advantage is nobody else's
 * business.
 *
 * It says nothing about *how long* it lasts, because the answer is now "until
 * you change it" — which is the whole of #187 and does not need a sentence.
 */
export function HintsToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
        Show me what I can play
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          variant={on ? "primary" : "secondary"}
          className="flex-1"
          aria-pressed={on}
          onClick={() => onChange(true)}
        >
          Guide me
        </Button>
        <Button
          variant={on ? "secondary" : "primary"}
          className="flex-1"
          aria-pressed={!on}
          onClick={() => onChange(false)}
        >
          I've got it
        </Button>
      </div>
      <p className="mt-2 text-xs text-white/40">
        {on
          ? "Your playable cards are marked up, and the table can see that they are."
          : "You work out your own moves. You can ask for a hand any time."}
      </p>
    </div>
  );
}

/**
 * Your first finished game, and the question about what happens next.
 *
 * **It offers rather than announces** (#187). It used to report that the
 * highlights had been taken away — a countdown nobody set, expiring on a
 * schedule nobody chose. Now the choice is yours and this is where it is put to
 * you, once, at the only moment anybody has enough of the game to answer it.
 *
 * Neither button is the default and nothing happens on its own: the preference
 * stays exactly as it is until one of them is pressed. Two answers, both named,
 * neither of them a dismissal — there is no way to close this without saying
 * which you want, because "I didn't read it" landing on *off* is the old
 * behaviour wearing a hat.
 *
 * It is only ever shown to somebody who had the help in the first place.
 * Nothing is being offered back to a player who never took it.
 */
export function Graduation({ onChoose }: { onChoose: (keep: boolean) => void }) {
  return (
    <div
      className={[
        "fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center",
        "pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Keep the highlights?"
    >
      <div className="flex w-full max-h-full max-w-md flex-col overflow-hidden rounded-2xl bg-felt-900 ring-1 ring-amber-300/30">
        <div className="overflow-y-auto p-5 pb-4">
          <h2 className="text-xl font-semibold text-amber-300">Nice one</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            That's a game under your belt. Do you want to keep having your playable cards marked
            up, or work them out yourself from here?
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            Either way you can change your mind whenever you like, from the cog in the corner.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 p-5 pt-0 sm:flex-row">
          <Button variant="secondary" className="flex-1" onClick={() => onChoose(true)}>
            Keep the help
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => onChoose(false)}>
            I'll take it from here
          </Button>
        </div>
      </div>
    </div>
  );
}
