import { useState } from "react";

import { describeEvent, spellSuits, type NameOf } from "../lib/format.ts";
import type { LoggedEvent } from "../lib/feed.ts";

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
}: {
  log: LoggedEvent[];
  nameOf: NameOf;
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
        onClick={() => setOpen((value) => !value)}
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
        <ol className="max-h-44 space-y-1 overflow-y-auto border-t border-white/10 px-3 py-2 text-xs text-white/60">
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
