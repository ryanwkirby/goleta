/**
 * The three doors onto large print (#323), which is one preference read from
 * `lib/largePrint.ts` and written to `localStorage` by whoever provides it.
 *
 * **The two on the way in are a glyph and nothing else; the one in the cog is a
 * settings row and keeps its label** (#431). #323 argued for a glass plus the
 * words *Large print* everywhere, on the reasoning that the pair is the whole
 * explanation and there is nothing to add about what pressing it does. That is
 * still true and it is not what the label was costing. The word is the widest
 * part of a control that is pressed once and then forgotten, and it was spending
 * about 130px of the top line of the lobby — the screen whose room code is the
 * thing to read. A glass with a **+** in it is what every browser, map and photo
 * viewer already means by *make this bigger*, and the **−** is the way back, so
 * the state is in the drawing rather than only in the lit colour.
 *
 * Losing the word means the accessible name has to be written out: `aria-label`
 * beside the `aria-pressed` this already carried, so what is announced is the
 * setting and whether it is on.
 */

import { SettingSwitch } from "./SettingSwitch.tsx";
import { useLargePrint } from "../lib/largePrint.ts";

/** Drawn rather than typed, like every other glyph here since #296: `🔍` is a
 * gamble on the device's font and comes out as a colour emoji on most of them,
 * which is the wrong weight for a control drawn in grey.
 *
 * **The sign inside it is the state, and the bar is always drawn** (#431): the
 * minus is common to both and the upright is what makes it a plus. Written that
 * way the two signs cannot drift apart in weight or position, and the change
 * between them is one stroke appearing rather than one drawing swapped for
 * another. */
function ZoomGlyph({ on, className = "size-6" }: { on: boolean; className?: string }) {
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
      <path d="M7.5 10.5h6" />
      {on ? null : <path d="M10.5 7.5v6" />}
    </svg>
  );
}

/**
 * The one on the way in: the lobby, and the head of the rules screen. **Top left
 * in both** (#431) — where the cog is at the table, and the corner a thumb
 * reaches on a phone held in either hand. It was at the right, which is where
 * nothing else in this app that changes the page sits.
 *
 * **A button that toggles rather than a switch**, which is the opposite of the
 * cog's row and is deliberate. Both places it is drawn are somewhere a person is
 * passing through and squinting at, and the honest read of a magnifying glass
 * with a plus in it is *press this to make it bigger* — an On/Off beside it
 * would be a second thing to parse before the first thing has happened. It says
 * which state it is in by the sign it carries, by being lit, and by the screen
 * it is on.
 *
 * `aria-pressed` rather than `role="switch"`, for the same reason: this is a
 * control that changes the page, not a value being set. The `title` still says
 * which way it would go, because a tooltip is read by somebody hovering over an
 * unlabelled glyph and that is the question they have.
 *
 * **44 square without a size class.** The glyph is 24 and the padding either
 * side comes to the rest, so the target is the one the whole app designs to and
 * stays that way if the glyph is ever redrawn a rung up.
 */
export function LargePrintButton({ className = "" }: { className?: string }) {
  const { on, choose } = useLargePrint();

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label="Large print"
      title={on ? "Back to the normal size" : "Draw everything bigger"}
      onClick={() => choose(!on)}
      className={[
        "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-2.5 py-1.5",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        // On is amber ink rather than an amber box. It is a utility control, and
        // boxed it came out as the second loudest thing on a lobby whose own
        // room code is the loud one — while the plainest statement that it is on
        // is the screen it is drawn on.
        on ? "text-amber-300 hover:bg-white/5" : "text-white/60 hover:bg-white/5 hover:text-white",
        className,
      ].join(" ")}
    >
      <ZoomGlyph on={on} />
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
