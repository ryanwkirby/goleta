/**
 * The three doors onto large print (#323), which is one preference read from
 * `lib/largePrint.ts` and written to `localStorage` by whoever provides it.
 *
 * **A glyph and a short label, in all three.** A magnifying glass with the words
 * *Large print* next to it is the whole explanation; there is nothing to say
 * about what one does that the thing itself does not say the moment it is
 * pressed. It is also the one setting in this app that a person can evaluate
 * instantly — the screen either got bigger or it didn't — so a blurb would be
 * describing something already on the screen.
 */

import { SettingSwitch } from "./SettingSwitch.tsx";
import { useLargePrint } from "../lib/largePrint.ts";

/** Drawn rather than typed, like every other glyph here since #296: `🔍` is a
 * gamble on the device's font and comes out as a colour emoji on most of them,
 * which is the wrong weight next to a word of grey small print. */
function GlassGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 21 21" />
    </svg>
  );
}

/**
 * The one on the way in: the lobby, and the head of the rules screen.
 *
 * **A button that toggles rather than a switch**, which is the opposite of the
 * cog's row and is deliberate. Both places it is drawn are somewhere a person is
 * passing through and squinting at, and the honest read of a magnifying glass
 * next to two words is *press this to make it bigger* — an On/Off beside it
 * would be a second thing to parse before the first thing has happened. It says
 * which state it is in by being lit, and by the screen it is on.
 *
 * `aria-pressed` rather than `role="switch"`, for the same reason: this is a
 * control that changes the page, not a value being set.
 */
export function LargePrintButton({ className = "" }: { className?: string }) {
  const { on, choose } = useLargePrint();

  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? "Back to the normal size" : "Draw everything bigger"}
      onClick={() => choose(!on)}
      className={[
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        on
          ? "bg-amber-400/15 text-amber-300 hover:bg-amber-400/25"
          : "text-white/60 hover:bg-white/5 hover:text-white",
        className,
      ].join(" ")}
    >
      <GlassGlyph />
      Large print
    </button>
  );
}

/**
 * The same preference as a settings row, for the *yours* half of the cog — the
 * shape `HintsRow` uses, beside it, because by then somebody has come to change
 * a setting rather than to be asked a question.
 *
 * It clears #188's bar for that page twice over: it belongs to one player, it
 * changes nothing about the room, and — unlike the two settings it sits with —
 * it is genuinely private. Nothing is shouted, no seat is marked, and nothing
 * goes on the wire.
 */
export function LargePrintRow() {
  const { on, choose } = useLargePrint();

  return (
    <SettingSwitch
      label="Large print"
      blurb="Bigger cards and bigger type."
      on={on}
      onChange={choose}
    />
  );
}
