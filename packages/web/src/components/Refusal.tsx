import type { GoletaError } from "../lib/feed.ts";
import { LAYER } from "../lib/layers.ts";

/**
 * Long enough to read three words twice and short enough that reaching for it
 * never occurs to anybody, which is what pays for having nothing to dismiss.
 * Kept in step with the `move-refusal` keyframes in `index.css`, or the pill
 * either vanishes mid-fade or leaves an invisible one behind.
 */
export const MOVE_MS = 1800;
export const SESSION_MS = 5000;

/**
 * The surface both refusals are drawn on: near-black and neutral, the shape a
 * snackbar has had for a decade. The meaning is carried by the sign and the
 * words.
 *
 * A red-flooded panel is wrong twice over here — red on this green is
 * complementary-colour vibration, and red already means *hearts and diamonds* on
 * a screen full of cards.
 */
const SURFACE =
  "bg-zinc-900/95 text-white shadow-xl ring-1 ring-white/10 backdrop-blur-sm";

/** Drawn rather than written, and rather than an emoji — ☀️ is the table's voice
 * and this is the app's. It is what lets the surface stay neutral. */
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
 * The answer to a mis-tap, placed immediately above the top edge of your own
 * cards (#99): it answers a tap you just made. It must never drift to the *top*
 * of the screen, which belongs to the Sunny announcement.
 * `pointer-events-none` throughout, so the hand under it stays tappable.
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
 * Everything that isn't a mis-tap: the room is full, the seat isn't yours, that
 * game is already under way. Same surface and sign; what differs is the weight.
 * `Join` latches the refused room code off the back of it precisely because it
 * lasts long enough to be read and acted on.
 */
export function SessionError({ error, onDismiss }: { error: GoletaError; onDismiss: () => void }) {
  return (
    <div
      role="status"
      // Centred across the full width, so in landscape a long refusal reaches the
      // island at whichever end the hardware is on.
      className={[
        `fixed inset-x-0 top-0 ${LAYER.alert} flex justify-center p-3`,
        "pt-[max(0.75rem,env(safe-area-inset-top))]",
        "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
      ].join(" ")}
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
