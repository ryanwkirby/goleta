/**
 * Asking for a hand, and being seen to ask. Help is always there, and taking it
 * is never quiet.
 */

import type { ShoutKind } from "@goleta/engine";

import { Button } from "./ui.tsx";

/**
 * Appears a few seconds into a turn you haven't moved on. Deliberately quiet: an
 * offer you can ignore, not a prompt you owe an answer.
 *
 * Quiet is not silent, and until #193 this was the second one — it arrived fully
 * formed at the exact moment somebody had stopped knowing what to do. It fades
 * in and rises a quarter of a rem into the place it was always going to occupy.
 * Nothing around it moves, it is mounted per offer so it cannot re-run, and it
 * leaves without an animation: the offer expires because you moved.
 */
export function HelpLink({ onAsk }: { onAsk: () => void }) {
  return (
    <button
      type="button"
      onClick={onAsk}
      // `shrink-0` rather than `self-start`: one of the rows it sits in is the peek
      // strip, where an offer that gave up width to a long prompt would be a tap
      // target squeezed to a sliver.
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

/** `help` is one turn's worth, asked for and gone. `hints` is the standing state
 * being switched on, announced once — after which the seat carries the mark. */
const SHOUTED: Record<ShoutKind, string> = {
  help: "help!",
  hints: "hints on",
};

const shoutText = (kind: ShoutKind, name?: string): string =>
  name ? `${name}: ${SHOUTED[kind]}` : SHOUTED[kind];

/** A map rather than a set, which it was until #187 added a second kind: a strip
 * that knew *that* somebody had spoken but not *what* would pick one wording and
 * be wrong half the time. */
export const shoutingNow = (shouts: readonly { playerId: string; kind: ShoutKind }[]) =>
  new Map(shouts.map((shout) => [shout.playerId, shout.kind]));

/**
 * The standing mark a seat carries while its cards are marked up (#187).
 * Deliberately quieter than the shout: that is the moment it was switched on,
 * this is the state. It has to be legible on a seat strip, on a shared screen
 * across a room, and beside a name at every size.
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
 * The same shout, in a line of furniture rather than over a hand. The two screens
 * that draw nobody else's cards had nothing for somebody else's ask to rise off,
 * so an IRL table full of landscape phones was the one place help was silent.
 *
 * It takes a name where it is drawn on its own and goes without one where it
 * already sits beside the person. No rise: a pill sliding around a 40px strip is
 * motion describing nothing.
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
 * Whether the table marks up your playable cards, as a switch you can find. Two
 * named answers, the shape `IrlToggle` and `DealerPicker` already use.
 *
 * **The copy says it is public, because it is** (#187): switching it on is
 * announced and marks your seat, and a player deciding here is entitled to know
 * that first. Switching it off is silent and the copy does not promise
 * otherwise. It says nothing about how long it lasts, because the answer is
 * "until you change it".
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
