import { useState } from "react";

import { Button } from "./ui.tsx";

/**
 * Whether this browser can be asked to stay in landscape once it gets there.
 *
 * `screen.orientation.lock()` only works from fullscreen and iOS Safari does
 * not implement it at all, so this is Chrome on Android in practice. Read once
 * at module scope: nothing about it changes while a page is open, and a control
 * that appeared halfway through a hand would be worse than one that never did.
 */
const canLock = (): boolean => {
  if (typeof document === "undefined") return false;
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (to: string) => Promise<void>;
  };
  return typeof orientation?.lock === "function" && !!document.documentElement.requestFullscreen;
};

/**
 * A phone held upright at a table it can't draw, asked to turn.
 *
 * **The prompt is the mechanism, not a fallback for one.** Landscape cannot be
 * forced from a web page: `screen.orientation.lock()` needs fullscreen and iOS
 * Safari has no implementation of it, so there is no API that turns somebody's
 * phone for them. Which is fine — everybody at an IRL table is sitting down,
 * this happens once, and it is the same gesture as picking up a hand of cards.
 *
 * There is no way past it and no "continue anyway": the hand view is a
 * landscape layout, and a portrait phone showing half of it would be worse than
 * a phone asking to be turned.
 *
 * **Nothing pauses behind it.** The game runs on the server, and somebody
 * holding their phone the wrong way is late to their turn, not somebody the
 * table waits for. Which is exactly why the connection state is on here: a
 * player who is blocked needs to be able to tell "turn your phone" from "this
 * app has stopped talking to anyone".
 */
export function RotatePanel({ offline }: { offline: boolean }) {
  const [supported] = useState(canLock);
  const [asked, setAsked] = useState(false);

  /**
   * Fullscreen, then hold it there. Failure is silent and changes nothing —
   * the panel is still up, the phone still turns, and an error banner about an
   * optional convenience would be noise over a screen that is already one
   * instruction long.
   */
  const lock = async (): Promise<void> => {
    setAsked(true);
    try {
      await document.documentElement.requestFullscreen();
      await (
        screen.orientation as ScreenOrientation & { lock?: (to: string) => Promise<void> }
      ).lock?.("landscape");
    } catch {
      /* not on this browser, not today */
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Turn your phone"
      className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center"
    >
      <span aria-hidden className="animate-rotate-hint text-6xl leading-none">
        📱
      </span>
      <div>
        <h2 className="text-xl font-semibold text-amber-300">Turn your phone sideways</h2>
        <p className="mt-2 text-balance text-sm leading-relaxed text-white/70">
          Everyone's in the same room, so this phone is just your hand. It needs the long way
          round.
        </p>
      </div>

      {/* No dead control where it can't work: a button that does nothing on iOS
          would read as the app being broken rather than the platform being
          what it is. */}
      {supported ? (
        <Button variant="secondary" onClick={() => void lock()}>
          {asked ? "Turn it now" : "Keep it landscape"}
        </Button>
      ) : null}

      {/* The one thing a blocked player still needs, and the reason it isn't
          left behind the panel. */}
      <p className="min-h-5 text-xs text-amber-300" aria-live="polite">
        {offline ? "reconnecting…" : ""}
      </p>
    </div>
  );
}
