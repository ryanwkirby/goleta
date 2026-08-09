import { useEffect } from "react";

import { Button } from "./ui.tsx";
import type { GoletaError } from "../net/useGoleta.ts";

/**
 * How long a refused move stays up, animation and all.
 *
 * Long enough to read three words twice, and short enough that reaching for it
 * never occurs to anybody — which is what pays for having nothing to dismiss.
 * Kept in step with the `move-refusal` keyframes in `index.css`; they own the
 * fade at each end and this owns the clearing up, so the two have to agree.
 */
const MOVE_MS = 1800;

/**
 * The answer to a mis-tap: a card that doesn't match, a turn that isn't yours.
 *
 * It sits at the **bottom**, over the hand, rather than at the top where every
 * other notice in the app lives. Two reasons, and both of them are the reason.
 * The top belongs to the Sunny announcement (`Sunny.tsx`), which is the one
 * thing at this table nobody may miss — a refusal is reachable during one, and
 * a pill landing on the ruling would cover the more important news with the
 * less. And a refusal is an answer to a tap that just happened, so it belongs
 * where the thumb that made it already is.
 *
 * `pointer-events-none` throughout: it overlaps the cards, and the hand under
 * it has to stay tappable — most of all by somebody trying the *right* card
 * immediately afterwards.
 */
export function MoveRefusal({ error, onDone }: { error: GoletaError; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, MOVE_MS);
    return () => clearTimeout(timer);
  }, [error.id, onDone]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <p className="animate-move-refusal rounded-full bg-felt-900/95 px-4 py-2 text-sm font-semibold text-white shadow-xl ring-1 ring-rose-400/50 backdrop-blur-sm">
        {error.message}
      </p>
    </div>
  );
}

/**
 * Everything that isn't a mis-tap: the room is full, the seat isn't yours any
 * more, that game is already under way.
 *
 * This one keeps the weight it has always had — top of the screen, five
 * seconds, and something to dismiss. It is news somebody has to do something
 * about, and `Join` latches the refused room code off the back of it precisely
 * because it lasts long enough to be read and acted on. A refusal that flashed
 * past would take the way out with it.
 */
export function SessionError({ error, onDismiss }: { error: GoletaError; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [error.id, onDismiss]);

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-40 flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <div className="flex max-w-md items-center gap-3 rounded-xl bg-rose-600 px-4 py-2.5 text-sm text-white shadow-xl">
        <span>{error.message}</span>
        <Button
          variant="ghost"
          className="min-h-0 px-2 py-0.5 text-xs text-white/80"
          onClick={onDismiss}
        >
          dismiss
        </Button>
      </div>
    </div>
  );
}
