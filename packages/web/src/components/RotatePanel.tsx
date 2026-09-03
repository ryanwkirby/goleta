import { Button } from "./ui.tsx";

/**
 * A phone held upright at a table it can't draw, asked to turn.
 *
 * **The prompt is the mechanism, not a fallback for one**: landscape cannot be
 * forced from a web page. **And nothing here reaches for the orientation lock
 * even where it exists** — it used to, and that froze the app's only view
 * switch, so a player could not reach the full table for the rest of the
 * session (#125).
 *
 * **There is a way past it that is not the gesture** (#407), and until then
 * there was not. The only exit was the browser reporting landscape, and an
 * iPhone reports portrait while being held sideways in at least two ordinary
 * ways: rotation lock, which is on half the phones at any table; and lying flat,
 * where iOS has no gravity vector to read and holds whatever orientation it last
 * had. Either one put that player behind this panel for the rest of the hand,
 * and the next deal asked again. It cost a real table their room — one
 * `gameStarted` line and nothing after it, then the same two people opening a
 * new room ninety seconds later.
 *
 * `onDismiss` stamps the deal, which is the identical fact turning the phone
 * stamps, so the route needs no second branch. What it lands on is the upright
 * table — a real screen, the one an online player gets and the one a watcher at
 * this same table gets — rather than a degraded anything.
 *
 * **It is small grey print and it stays that way.** The gesture is worth
 * teaching and this panel is what teaches it, so the escape must not read as the
 * other half of a choice.
 *
 * **The words are the animation's, not a caption's.** This carried two sentences
 * under the heading that restated it, explained a room the player is sitting in,
 * and described what they would see when it worked. One of them also said *lay
 * it flat on the table*, which is the instruction that makes the rotation
 * undetectable — so cutting the paragraph and fixing the lockout were one edit.
 *
 * Nothing pauses behind any of it, which is why the connection state is on here:
 * a blocked player can tell "turn your phone" from "this app has stopped talking
 * to anyone".
 */
export function RotatePanel({ offline, onDismiss }: { offline: boolean; onDismiss: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Turn your phone"
      className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center"
    >
      <span aria-hidden className="animate-rotate-hint text-7xl leading-none">
        📱
      </span>

      <h2 className="text-xl font-semibold text-amber-300">Turn your phone sideways</h2>

      <div className="flex flex-col items-center gap-1">
        {/* `ghost` rather than hand-rolled small print: the people who need this
            are the ones with no other way to answer the panel, so it has to read
            as something to press and be a full thumb to press it with. The
            variant is already the app's quiet control, and next to an amber
            heading it is plainly the subordinate half. */}
        <Button variant="ghost" onClick={onDismiss}>
          Play upright
        </Button>

        {/* Its line is reserved either way, so nothing above it moves when the
            socket drops (#131). */}
        <p className="min-h-5 text-xs text-amber-300" aria-live="polite">
          {offline ? "reconnecting…" : ""}
        </p>
      </div>
    </div>
  );
}
