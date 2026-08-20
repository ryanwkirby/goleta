/**
 * Your own settings, as opposed to the table's (#188). The host has a cog behind
 * the table (#134) and nobody else had anything.
 *
 * **The bar for putting something in here is that it belongs to one player and
 * changes nothing about the room.** That rules out everything on
 * `HostSettings.tsx`. Two cogs this close together want the difference to be
 * legible, so this one is a person rather than a gear and says *you* where the
 * host's says *table*. It also rules out the sort control, which is already next
 * to the hand it arranges.
 *
 * **A watcher gets no cog**: the only thing in here is about your own cards.
 * Opening it sends nothing — the hints toggle inside is public (#187), but that
 * is the toggle's doing.
 */

import { useState } from "react";

import { HintsToggle } from "./Help.tsx";
import { Button, Panel } from "./ui.tsx";

/** A head and shoulders: a person, where the host's control is a machine. */
function PlayerGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}

export function PlayerSettingsCog({
  hints,
  onHints,
  className = "",
}: {
  hints: boolean;
  onHints: (on: boolean) => void;
  /** Where the caller wants it sat in its row. The size is not the caller's. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Your settings"
        aria-expanded={open}
        title="Your settings"
        onClick={() => setOpen(true)}
        className={[
          // The same 44px square as the host's, because they are the same kind of
          // thing and sit next to each other; the glyph is what separates them.
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
          "leading-none text-white/60 transition-colors hover:bg-white/5 hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
          className,
        ].join(" ")}
      >
        <PlayerGlyph />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Your settings"
          onClick={() => setOpen(false)}
        >
          <Panel
            className="flex w-full max-w-sm flex-col gap-4"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Said here rather than on the toggle, because it is what makes this
                drawer different from the host's: nothing in here reaches
                anybody else's game. */}
            <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
              Yours, not the table's
            </p>

            <HintsToggle on={hints} onChange={onHints} />

            <Button variant="secondary" full onClick={() => setOpen(false)}>
              Done
            </Button>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
