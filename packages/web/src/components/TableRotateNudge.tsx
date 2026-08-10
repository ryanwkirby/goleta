import { useState } from "react";

import { useBrowserChrome } from "../lib/fullscreen.ts";
import { useIsPhone, useIsPortrait } from "../lib/viewport.ts";
import { Button } from "./ui.tsx";

/**
 * A phone standing in for a spare tablet, asked to stand upright instead.
 *
 * The shared screen lies flat in the middle of a table with people round it, so
 * which way up the *device* is means nothing to anybody reading it — the board
 * is turned a quarter to suit (`fitScale.ts`). What it does decide is how much
 * of the screen the browser keeps, and on a phone that is most of the argument:
 * held sideways the address bar takes a third of the short side, and the board
 * comes out smaller than it does upright with the whole thing turned round.
 *
 * | held      | viewport   | board |
 * | --------- | ---------- | ----- |
 * | landscape | ~734×320   | ×0.57 |
 * | upright, turned a quarter | ~393×659 | ×0.66 |
 *
 * **A nudge, not a block**, which is where this parts company with
 * `RotatePanel`. That one guards a layout that genuinely cannot be drawn the
 * other way up, on the device its owner is playing their hand on. This one is
 * an optional extra screen that holds no cards, and somebody has usually just
 * propped it and walked back to their seat — a prompt with no way past would be
 * a device sitting there showing a sentence. So it says what it buys, and gets
 * out of the way for good on a tap.
 *
 * **Only where the ask is worth making.** A phone-sized screen, held the long
 * way, with a browser bar to be rid of. Fullscreen or installed, both ways up
 * give the same rectangle and there is nothing to gain; a tablet or a
 * television clears the size test and is never asked. None of it is a user
 * agent — the same rule the rest of this app follows.
 *
 * And nothing here turns anybody's phone. `screen.orientation.lock()` needs
 * fullscreen and iOS Safari has no implementation, so no page can — see
 * `RotatePanel` for the longer version, and #125 for what happened the last
 * time something in here reached for it.
 */
export function TableRotateNudge() {
  const phone = useIsPhone();
  const portrait = useIsPortrait();
  const chrome = useBrowserChrome();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || portrait || !phone || !chrome) return null;

  return (
    <div
      role="dialog"
      aria-label="Stand this screen upright"
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-felt-950/95 p-6 text-center"
    >
      <span aria-hidden className="animate-rotate-hint text-5xl leading-none">
        📱
      </span>
      <div>
        <h2 className="text-lg font-semibold text-amber-300">Stand this screen upright</h2>
        <p className="mt-2 text-balance text-sm leading-relaxed text-white/70">
          The address bar takes less room that way, and the table gets drawn sideways to suit — so
          the cards come out bigger than they do with the phone on its side.
        </p>
      </div>
      <Button variant="secondary" onClick={() => setDismissed(true)}>
        Show it anyway
      </Button>
    </div>
  );
}
