/**
 * A phone held upright at a table it can't draw, asked to turn.
 *
 * **The prompt is the mechanism, not a fallback for one.** Landscape cannot be
 * forced from a web page: `screen.orientation.lock()` needs fullscreen and iOS
 * Safari has no implementation of it, so there is no API that turns somebody's
 * phone for them. Which is fine — everybody at an IRL table is sitting down,
 * this happens once, and it is the same gesture as picking up a hand of cards.
 *
 * **And nothing here reaches for that lock even where it exists.** It used to,
 * behind a "keep it landscape" button, which froze the app's only view switch:
 * once locked, turning the phone upright did nothing, `useIsPortrait` never
 * flipped, and that player could not reach the full table with everybody's
 * hands face up for the rest of the session. A button that quietly deletes half
 * the app, offered on the one panel whose whole job is teaching the gesture it
 * disables. The screen space it was bundled with is worth having and is offered
 * on its own in the peek strip, where a sideways phone can actually reach it —
 * fullscreen survives a rotation, which is the behaviour wanted all along and
 * the thing the lock was preventing (#125).
 *
 * There is no way past this and no "continue anyway": the hand view is a
 * landscape layout, and a portrait phone showing half of it would be worse than
 * a phone asking to be turned.
 *
 * **Nothing pauses behind it.** The game runs on the server, and somebody
 * holding their phone the wrong way is late to their turn, not somebody the
 * table waits for. Which is exactly why the connection state is on here: a
 * player who is blocked needs to be able to tell "turn your phone" from "this
 * app has stopped talking to anyone".
 */
export function RotatePanel({ offline }: { offline: boolean }) {
  return (
    <div
      role="dialog"
      aria-label="Turn your phone"
      className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center"
    >
      <span aria-hidden className="animate-rotate-hint text-6xl leading-none">
        📱
      </span>
      <div>
        <h2 className="text-xl font-semibold text-amber-300">Turn your phone sideways</h2>
        <p className="mt-2 text-balance text-sm leading-relaxed text-white/70">
          Because everyone's in the same room, turn your phone sideways and lay it flat on the
          table. You should be able to see everyone else's phone screen.
        </p>
      </div>

      {/* The one thing a blocked player still needs, and the reason it isn't
          left behind the panel. */}
      <p className="min-h-5 text-xs text-amber-300" aria-live="polite">
        {offline ? "reconnecting…" : ""}
      </p>
    </div>
  );
}
