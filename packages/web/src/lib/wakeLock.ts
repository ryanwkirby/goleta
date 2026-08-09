/**
 * Keeping a screen awake at a table where nobody is touching it.
 *
 * A phone left alone locks itself in thirty seconds. At a table of six the gap
 * between your turns is minutes, and IRL mode makes that worse rather than
 * better — the whole point is that you are looking at the people. Every turn
 * would then start by waking a phone, and a challenge window, which is over as
 * soon as the next player moves, is simply not catchable through a lock screen.
 * A table screen is worse still: nobody touches it at all.
 *
 * Three things about it are easy to get wrong, and all three are the reason
 * this is a module rather than four lines in a component:
 *
 *   - **The lock is dropped when the tab is hidden and is not given back.** It
 *     has to be re-requested when the document becomes visible, or it survives
 *     exactly one lock screen and then quietly stops working.
 *   - **The request can reject** — battery saver, an unsupported browser, a
 *     page that isn't in a secure context. It fails silently and changes
 *     nothing. A wake lock is a nicety; an error banner about one would be
 *     noise about something nobody asked for.
 *   - **Nothing is held in an online room.** Somebody playing on their laptop
 *     at home has an operating system that knows what it is doing, and holding
 *     their screen on for a browser tab is rude.
 */

import { useEffect } from "react";

/**
 * Holds a screen wake lock for as long as `active` is true.
 *
 * The effect re-runs on `active`, so turning IRL mode off mid-game, finishing
 * the game, or leaving the room each release it on the way past — there is no
 * separate teardown to remember.
 */
export const useWakeLock = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;
    // Typed as always present, and absent in practice on anything older or on
    // an insecure origin — so it is checked rather than trusted.
    const api = navigator.wakeLock as Navigator["wakeLock"] | undefined;
    if (!api) return;

    // `held` is only ever the *current* sentinel. A re-request after the tab
    // came back replaces it, and the one it replaces was already released by
    // the browser when the tab went away.
    let held: WakeLockSentinel | null = null;
    let stopped = false;

    const hold = async (): Promise<void> => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        held = await api.request("screen");
        // Asked to stop while the request was in flight. Let it go rather than
        // leaving a lock nobody has a handle on.
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
