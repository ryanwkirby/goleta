/**
 * "The seats have moved — here's where you're sitting now." (#199)
 *
 * In an online room a shuffle is the whole of it. Where everybody is round one
 * table, turn order and physical order have to agree, and the lobby spends real
 * effort making them — so a setting that reshuffled every hand and said nothing
 * would undo all of it. **The shuffle is what makes this screen necessary and
 * this screen is what makes the shuffle usable.**
 *
 * **Nothing pauses behind it**, and it is dismissed by hand rather than on a
 * timer: people have to get up and move.
 */

import type { RoomView } from "@goleta/engine";

import { Button, Panel } from "./ui.tsx";

export function TakeYourSeat({
  room,
  you,
  onDone,
}: {
  room: RoomView;
  /** Your own seat, so the list can say which one to go to. Null for a watcher. */
  you: string | null;
  onDone: () => void;
}) {
  return (
    <div
      className={[
        "fixed inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-sm",
        "pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1.25rem,env(safe-area-inset-right))]",
        "pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Take your seat"
    >
      <Panel className="flex max-h-full w-full max-w-sm flex-col overflow-hidden">
        <div className="-mx-5 -mt-5 min-h-0 flex-1 overflow-y-auto px-5 pt-5">
          <h2 className="text-xl font-semibold text-amber-300">Take your seat</h2>
          <p className="mt-1 text-sm text-white/60">
            The seats have been shuffled. Sit in this order, going round the table.
          </p>

          <ol className="mt-4 flex flex-col gap-1.5">
            {room.seats.map((seat, index) => (
              <li
                key={seat.id}
                className={[
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                  seat.id === you
                    ? "bg-amber-400/15 font-semibold text-white ring-1 ring-amber-300/50"
                    : "bg-white/5 text-white/80",
                ].join(" ")}
              >
                <span className="w-4 shrink-0 text-xs tabular-nums text-white/40">{index + 1}</span>
                <span className="min-w-0 truncate">{seat.name}</span>
                {seat.bot ? (
                  <span className="ml-auto shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] text-white/60">
                    bot
                  </span>
                ) : null}
                {seat.id === you ? (
                  <span className="ml-auto shrink-0 text-xs text-amber-300">you</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        {/* Dismissed by each phone for itself: everybody moves at their own speed,
            and a shared dismissal would take the list away from whoever is still
            standing up. */}
        <div className="shrink-0 pt-4">
          <Button variant="primary" full onClick={onDone}>
            Sitting down
          </Button>
        </div>
      </Panel>
    </div>
  );
}
