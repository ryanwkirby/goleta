import { useState } from "react";

import { describeEvent, spellSuits, type NameOf } from "../lib/format.ts";
import type { LoggedEvent } from "../lib/feed.ts";
import { logList } from "../lib/logRoom.ts";

/**
 * One line of the log, shown with its pips and read out with its words. Same
 * sentence either way — see `spellSuits`.
 */
function Line({ children }: { children: string }) {
  return (
    <>
      <span aria-hidden>{children}</span>
      <span className="sr-only">{spellSuits(children)}</span>
    </>
  );
}

export function EventLog({
  log,
  nameOf,
  concealed = false,
  slack,
}: {
  log: LoggedEvent[];
  nameOf: NameOf;
  /**
   * The felt the piles are sitting in and not using, which is what this may grow
   * into (#352). Read off the column, and taken **once**, on the way open — see
   * `lib/logRoom.ts` for why following it live is a loop rather than a cap.
   */
  slack: number;
  /**
   * Whether this player is part-way through an accusation (#319). Their own log
   * is every card played into the middle, in order, in words — which is the
   * board the call is judged against, written out, at the one moment they are
   * being asked to remember it (#318).
   *
   * **The collapsed line goes too**, and it is the half that mattered most: it
   * is the most recent event, and after a reach the most recent event is very
   * often the play that changed the board.
   *
   * It keeps its space and says what it is doing rather than disappearing. A box
   * vanishing out of the column the moment you tap a control reads as a bug, the
   * caller knows perfectly well what they are being denied, and the cards above
   * it do not move under a thumb (#131).
   */
  concealed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  /**
   * The room there was the moment this was opened. Held rather than followed:
   * the slack is what the list is about to take, so a cap that tracked it would
   * be re-deciding its own input. Turning the phone or a seat gaining a row
   * while the log is open leaves it a little stale until it is next opened,
   * which is the trade — the cap is a maximum, so stale means the column
   * overflows and the page scrolls, the way it always did.
   */
  const [room, setRoom] = useState(0);
  const latest = log[0];

  // Held rather than reset, so backing out of a call gives you the log the way
  // you left it. There is nothing to protect by then: the question has gone.
  if (concealed) {
    return (
      <div className="rounded-xl bg-black/25 ring-1 ring-white/10">
        <p className="flex items-center gap-2 px-3 py-2 text-xs text-white/40">
          <span aria-hidden>☀️</span> the log is hidden while you name a card
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-black/25 ring-1 ring-white/10">
      <button
        type="button"
        onClick={() => {
          // Read on the way in, while the piles are still holding all of it.
          if (!open) setRoom(logList(slack));
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <span className="truncate">
          <Line>{latest ? describeEvent(latest.event, nameOf) : "Nothing has happened yet."}</Line>
        </span>
        <span aria-hidden className="ml-auto shrink-0 text-white/40">
          {open ? "▾" : "▴"}
        </span>
      </button>

      {open ? (
        // The bottom twelve pixels fade rather than ending at a hard edge. An
        // entry is a whole number of line boxes and a wrapped one is two or
        // three, so there is no pitch to round the box down to that would leave
        // a whole line showing — and a scroll slices one mid-gesture whatever
        // the box is. A line going quietly says *more below*; a line cut through
        // the middle says the panel is broken. The list's own `py-2` is eight of
        // the twelve, so what this actually touches is a descender.
        <ol
          style={{
            maxHeight: room,
            maskImage: "linear-gradient(to bottom, #000 calc(100% - 12px), transparent)",
          }}
          className="space-y-1 overflow-y-auto border-t border-white/10 px-3 py-2 text-xs text-white/60"
        >
          {log.map((entry) => (
            <li key={entry.id}>
              <Line>{describeEvent(entry.event, nameOf)}</Line>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
