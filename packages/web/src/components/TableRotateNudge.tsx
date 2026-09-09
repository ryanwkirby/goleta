import { useState } from "react";

import { useBrowserChrome } from "../lib/fullscreen.ts";
import { useIsPhone, useIsPortrait } from "../lib/viewport.ts";
import { Button } from "./ui.tsx";

/**
 * A phone standing in for a spare tablet, asked to stand upright instead. Which
 * way up the *device* is means nothing — the board turns a quarter to suit — but
 * it decides how much of the screen the browser keeps: an iPhone fits the board
 * at ×0.57 held sideways and ×0.66 upright-and-turned.
 *
 * **A nudge, not a block**, which is where this parts company with
 * `RotatePanel`: that guards a layout that cannot be drawn the other way up, on
 * a device somebody is playing their hand on. Only asked where there is a
 * browser bar to be rid of, and none of it is a user agent.
 *
 * **The picture asks for the same thing the heading does** (#447), and until now
 * it asked for the reverse. This drew `animate-rotate-hint` — `RotatePanel`'s
 * keyframe, which starts a phone upright, turns it a quarter and rests it on its
 * side, because that is the gesture *that* panel wants — under a heading saying
 * *stand this screen upright*. Under `prefers-reduced-motion` the rest is the
 * only frame there is, so the one player who never sees the movement saw nothing
 * but the wrong end of it.
 *
 * It is easy to miss, and worth saying why: a rotating phone reads as *rotation*
 * in general, and this panel still has a paragraph doing the explaining that
 * `RotatePanel` deliberately no longer has (#407). `animate-stand-hint` is the
 * same movement with its ends swapped — sideways, then upright, resting upright.
 * The two are not one animation on purpose: #446 flipped the shared keyframe's
 * direction and this mirrored with it, still pointing the wrong way, which is
 * what sharing a name costs when the name is an instruction.
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
      <span aria-hidden className="animate-stand-hint text-5xl leading-none">
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
