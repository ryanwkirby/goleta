/**
 * Keeping a screen awake at a table where nobody is touching it. A phone locks
 * itself in thirty seconds, and a challenge window is over as soon as the next
 * player moves — not something you catch through a lock screen.
 *
 * Three things are easy to get wrong. **The lock is dropped when the tab is
 * hidden and is not given back**, so it has to be re-requested on
 * `visibilitychange` or it survives exactly one lock screen. **The request can
 * reject** — battery saver, old browser, insecure origin — and fails silently,
 * because a wake lock is a nicety nobody asked for. And **nothing is held in an
 * online room**: a laptop has an OS that knows what it is doing.
 */

import { useEffect } from "react";

/** The effect re-runs on `active`, so turning IRL mode off, finishing the game
 * or leaving the room each release it on the way past. */
export const useWakeLock = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;
    // Typed as always present, and absent in practice on anything older or on an
    // insecure origin.
    const api = navigator.wakeLock as Navigator["wakeLock"] | undefined;
    if (!api) return;

    // Only ever the *current* sentinel: a re-request after the tab came back
    // replaces one the browser had already released.
    let held: WakeLockSentinel | null = null;
    let stopped = false;

    const hold = async (): Promise<void> => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        held = await api.request("screen");
        // Asked to stop while the request was in flight.
        if (stopped) void held.release().catch(() => undefined);
      } catch {
        /* battery saver, an old browser, an insecure origin. Never mind. */
      }
    };

    const onVisible = (): void => {
      if (document.visibilityState === "visible") void hold();
    };

    void hold();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (held && !held.released) void held.release().catch(() => undefined);
      held = null;
    };
  }, [active]);
};
