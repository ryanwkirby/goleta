import { useState } from "react";

import { describeEvent, type NameOf } from "../lib/format.ts";
import type { LoggedEvent } from "../net/useGoleta.ts";

export function EventLog({ log, nameOf }: { log: LoggedEvent[]; nameOf: NameOf }) {
  const [open, setOpen] = useState(false);
  const latest = log[0];

  return (
    <div className="rounded-xl bg-black/25 ring-1 ring-white/10">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <span className="truncate">
          {latest ? describeEvent(latest.event, nameOf) : "Nothing has happened yet."}
        </span>
        <span aria-hidden className="ml-auto shrink-0 text-white/40">
          {open ? "▾" : "▴"}
        </span>
      </button>

      {open ? (
        <ol className="max-h-44 space-y-1 overflow-y-auto border-t border-white/10 px-3 py-2 text-xs text-white/60">
          {log.map((entry) => (
            <li key={entry.id}>{describeEvent(entry.event, nameOf)}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
