/**
 * A phone held upright at a table it can't draw, asked to turn.
 *
 * **The prompt is the mechanism, not a fallback for one**: landscape cannot be
 * forced from a web page. **And nothing here reaches for the orientation lock
 * even where it exists** — it used to, and that froze the app's only view
 * switch, so a player could not reach the full table for the rest of the
 * session (#125).
 *
 * There is no way past this, and **nothing pauses behind it** — which is why the
 * connection state is on here, so a blocked player can tell "turn your phone"
 * from "this app has stopped talking to anyone".
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

      {/* The one thing a blocked player still needs, and the reason it isn't left
          behind the panel. */}
      <p className="min-h-5 text-xs text-amber-300" aria-live="polite">
        {offline ? "reconnecting…" : ""}
      </p>
    </div>
  );
}
