import type { GoletaError } from "../net/useGoleta.ts";

/**
 * How long each weight of refusal stays up.
 *
 * `MOVE_MS` is long enough to read three words twice and short enough that
 * reaching for it never occurs to anybody — which is what pays for having
 * nothing to dismiss. It is kept in step with the `move-refusal` keyframes in
 * `index.css`: they own the fade at each end, `App` owns the clearing up, and
 * the two figures have to agree or the pill either vanishes mid-fade or leaves
 * an invisible one behind.
 */
export const MOVE_MS = 1800;
export const SESSION_MS = 5000;

/**
 * The surface both refusals are drawn on.
 *
 * Near-black and neutral, with a hairline and a shadow to lift it off the
 * table — the shape a snackbar has had on every platform for a decade, and the
 * one thing on screen that should not look like it belongs to the felt. The
 * meaning is carried by the sign and the words; the panel stays out of it.
 *
 * The obvious alternative, a red-flooded panel, is wrong twice over here. Red
 * on this green is complementary-colour vibration, and red already means
 * *hearts and diamonds* on a screen full of cards. Spending it on furniture
 * would be spending the one colour the table cannot lend out.
 */
const SURFACE =
  "bg-zinc-900/95 text-white shadow-xl ring-1 ring-white/10 backdrop-blur-sm";

/**
 * The universal "no": a circle with a bar through it.
 *
 * Drawn rather than written, and drawn rather than an emoji — ☀️ is the table's
 * voice and this is the app's. It is what lets the surface stay neutral: the
 * sign says "refused" on its own, so nobody has to be able to tell rose from
 * white to know what happened.
 */
function NoSign({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 18 18 6" />
    </svg>
  );
}

/**
 * The answer to a mis-tap: a card that doesn't match, a turn that isn't yours.
 *
 * Placed by whichever layout is showing, immediately above the top edge of your
 * own cards (#99) — `Table` and `HandView` each keep the hand in a `relative`
 * box for this, and `HelpShout` hangs off the same one. It answers a tap you
 * just made, so it belongs against the thing you tapped rather than pinned to
 * the furniture at the foot of the screen.
 *
 * It must never drift to the *top* of the screen. That belongs to the Sunny
 * announcement, which is the one thing at this table nobody may miss, and a
 * refusal is perfectly reachable while one is up.
 *
 * `pointer-events-none` throughout: it hangs over the cards, and the hand under
 * it has to stay tappable — most of all by somebody trying the *right* card
 * immediately afterwards.
 */
export function MoveRefusal({ error }: { error: GoletaError }) {
  return (
    <p
      role="status"
      className={[
        "animate-move-refusal pointer-events-none absolute bottom-full left-1/2 z-20",
        "mb-2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap",
        "rounded-full py-1.5 pl-2.5 pr-3.5 text-sm font-semibold",
        SURFACE,
      ].join(" ")}
    >
      <NoSign className="h-4 w-4 shrink-0 text-rose-400" />
      {error.message}
    </p>
  );
}

/**
 * Everything that isn't a mis-tap: the room is full, the seat isn't yours any
 * more, that game is already under way.
 *
 * Same surface and same sign as the pill, because it is the same kind of news;
 * what differs is the weight. It keeps the top of the screen, five seconds, and
 * something to dismiss — `Join` latches the refused room code off the back of
 * it precisely because it lasts long enough to be read and acted on, and a
 * refusal that flashed past would take the way out with it.
 */
export function SessionError({ error, onDismiss }: { error: GoletaError; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-40 flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <div className={["flex max-w-md items-start gap-2.5 rounded-2xl py-3 pl-3.5 pr-2.5 text-sm", SURFACE].join(" ")}>
        <NoSign className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <span className="min-w-0">{error.message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={[
            "-my-1 -mr-0.5 shrink-0 rounded-lg p-1.5 text-white/50",
            "transition-colors hover:bg-white/10 hover:text-white",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
          ].join(" ")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M6 6 18 18M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
