import { useState } from "react";

import { useBrowserChrome } from "../lib/fullscreen.ts";
import { useIsPhone, useIsPortrait } from "../lib/viewport.ts";
import { Button } from "./ui.tsx";

/**
 * A phone standing in for a spare tablet, asked to stand upright instead.
 *
 * The shared screen lies flat with people round it, so which way up the *device*
 * is means nothing — the board is turned a quarter to suit (`fitScale.ts`). What
 * it does decide is how much of the screen the browser keeps: held sideways an
 * iPhone fits the board at ×0.57, upright-and-turned at ×0.66.
 *
 * **A nudge, not a block**, which is where this parts company with
 * `RotatePanel`: that guards a layout that cannot be drawn the other way up, on
 * the device somebody is playing their hand on. This is an optional extra screen
 * holding no cards, usually just propped by somebody walking back to their seat.
 *
 * **Only where the ask is worth making** — a phone-sized screen, held the long
 * way, with a browser bar to be rid of. None of it is a user agent.
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
