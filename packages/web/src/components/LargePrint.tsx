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
 * The one on the way in: the lobby, and the head of the rules screen. **It hangs
 * out of the flow, in the corner each of those screens leaves empty** (#444).
 * #431 took the label off it and put it top left in both, and left it drawn as a
 * row of its own — so the first thing at the top of the lobby was an unlabelled
 * glyph above the room code, and the first thing in the rules panel was one
 * above *How goleta works*. A control pressed once and then forgotten was
 * leading two screens and spending a line on each.
 *
 * `absolute` in both, so it costs no row: the room code and the heading are back
 * at the top of their screens and the glass hovers beside them over felt that
 * was empty anyway. **Which corner is whichever one is actually empty**, which
 * is the lobby's left and the rules panel's right — the lobby's code is centred
 * with the copy control in its right flank (#243), and the rules panel's heading
 * is left-aligned with nothing after it. That is #431's *same side in both*
 * spent, and it buys the thing #431 was arguing about: neither one is in front
 * of the screen's own subject any more. Both are still the head of the screen,
 * both are still one dim glyph, and there is nowhere else on either screen a
 * 44px target fits without pushing something.
 *
 * The rules panel is where #431 said this could not go, because a glass and a
 * label beside the heading broke *How goleta works* over two lines in large
 * print. Out of the flow it takes no width from the heading — `pr-11` reserves
 * what it covers, so a wrap puts the second line under it rather than through
 * it.
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
        //
        // Off is dimmer than the app's ordinary grey (#444), because this is the
        // one control here that is drawn over somebody else's subject rather
        // than in a row of its own: at `white/60` a glyph floating beside the
        // room code read as something to attend to. Hover takes it back up, and
        // on stays amber — going quiet is for the state nobody is looking for.
        on ? "text-amber-300/80 hover:bg-white/5" : "text-white/30 hover:bg-white/5 hover:text-white/70",
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
