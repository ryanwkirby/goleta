/**
 * Asking for a hand, and being seen to ask. Help is always there, and taking it
 * is never quiet.
 */

import type { ShoutKind } from "@goleta/engine";

import { SettingSwitch } from "./SettingSwitch.tsx";
import { TwoWay } from "./TwoWay.tsx";
import { Button } from "./ui.tsx";
import { LAYER } from "../lib/layers.ts";

/**
 * Appears a few seconds into a turn you haven't moved on. Deliberately quiet: an
 * offer you can ignore, not a prompt you owe an answer. Quiet is not silent, and
 * until #193 this was the second one — it fades in and rises a quarter of a rem
 * into the place it was always going to occupy, mounted per offer so it cannot
 * re-run, and leaves without an animation.
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
 * Whether the table marks up your playable cards. **The same preference, asked
 * for in two different places, so it is drawn twice** (#290).
 *
 * `HintsQuestion` is the one below the rules — the last decision before
 * somebody's first hand, where the honest thing to ask is whether they are
 * still confused. `HintsRow` is the one in the cog, where they came to change a
 * setting and the question is not being asked of them. Both write the same
 * preference through the same `onChange`; there is no second piece of state and
 * no second source of truth.
 *
 * **What neither of them changes** (`AGENTS.md`, the hints bullet): switching it
 * **on** is still shouted, the seat still carries a standing mark for as long as
 * it lasts, switching it **off** is still silent, and it still never expires. It
 * is presentation — `packages/engine` never learns it exists, it is not on
 * `GameOptions` or `HouseRules`, and no bot reads it.
 */
const HINTS = [
  { value: "yes", label: "Yes, guide me" },
  { value: "no", label: "I think I've got it" },
] as const;

/**
 * The first-run question, at the foot of the rules screen.
 *
 * **Written from the player's side of the question** (#251): *Still confused?*
 * is what somebody actually has when they reach this, and both answers sound
 * like a person answering it. "I think I've got it" is the honest one — the old
 * wording asked for a confidence nobody has before their first hand.
 *
 * It says nothing about how long it lasts, because it lasts until you change
 * it. It no longer says the table can see it either: the shout still happens
 * and the seat still carries the mark (#187), so the sentence was one of three
 * places that is said rather than the only one.
 *
 * **This is the "before" of #187's three moments** — before the first hand,
 * after the first finished game, and in the cog at any time. Taking it off the
 * rules screen would delete the first one, which is why #290 split the control
 * rather than replacing it.
 */
export function HintsQuestion({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
        Still confused?
      </p>
      <TwoWay
        label="Still confused?"
        options={HINTS}
        value={on ? "yes" : "no"}
        onChange={(answer) => onChange(answer === "yes")}
        className="mt-2"
      />
      <p className="mt-2 text-xs text-white/40">
        {on
          ? (
            <>
              Tutorial mode. Each turn, we'll show you which cards are playable.{" "}
              <em>(You can turn this off in the settings when you're ready.)</em>
            </>
          )
          : (
            <>
              You won't be helped automatically. <em>(But you can ask!)</em>
            </>
          )}
      </p>
    </div>
  );
}

/**
 * The same preference as a settings row, for the *yours* half of the cog.
 *
 * The cog is opened mid-game by somebody who came to change a setting, and
 * *Still confused?* answered by *Yes, guide me* / *I think I've got it* is a
 * question nobody there is asking — worse, it never said what the setting was
 * called. So: the name it is known by, four words of what it does, and the plain
 * On/Off the house-rules rows beside it already use.
 */
export function HintsRow({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    // What you get rather than the mechanism — and the *always* is what separates
    // the standing preference from the two kinds of help you can have a single
    // turn of (#305).
    <SettingSwitch
      label="Tutorial mode"
      blurb="Always show which cards are playable."
      on={on}
      onChange={onChange}
    />
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
        `fixed inset-0 ${LAYER.overlay} flex items-end justify-center bg-black/60 sm:items-center`,
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
