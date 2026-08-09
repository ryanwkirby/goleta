/**
 * Offering a phone the rest of its screen, in the view that wants it.
 *
 * Browser chrome costs the landscape hand view a strip of the one thing it
 * exists to make bigger. Fullscreen buys it back, and there are three things
 * about the offer that are easy to get wrong:
 *
 *   - **It cannot be asked for programmatically.** `requestFullscreen()` needs
 *     a user gesture, so there has to be something to tap, and it has to live
 *     where the orientation this is about can reach it.
 *   - **It does not stay taken.** Backgrounding the tab drops it on Android and
 *     so does the exit gesture, and getting it back needs a fresh gesture. So
 *     the offer has to come back on its own rather than being a one-shot.
 *   - **Half the phones in the world do not have it.** The Fullscreen API is
 *     still iPad-only on iOS, so an iPhone must simply not be offered it —
 *     never a disabled control, which reads as the app being broken rather than
 *     the platform being what it is.
 *
 * **Nothing here locks orientation.** `screen.orientation.lock()` would freeze
 * the app's only view switch — turning the phone upright is how you reach the
 * full table — so taking the screen space would quietly delete half the app.
 * Fullscreen survives a rotation on its own, which is exactly the behaviour
 * wanted; the lock was the only thing preventing it (#125).
 */

import { useEffect, useState } from "react";

/**
 * Whether this browser has the Fullscreen API at all.
 *
 * Feature-detected, never sniffed: the question is whether the call exists, and
 * a user-agent test would answer a different one and get it wrong on the next
 * browser. Read once — nothing about it changes while a page is open.
 */
const SUPPORTED = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

/**
 * Whether to offer the screen, and how to take it.
 *
 * `offer` is false while fullscreen is already held, so the control disappears
 * the moment it is taken and returns by itself when the browser hands it back.
 * The listener covers the exit gesture; `visibilitychange` covers the tab being
 * backgrounded, where the drop can land while nobody is watching the event.
 */
/**
 * Take the screen. Failure is silent and changes nothing: the view is still
 * usable, and an error banner about an optional convenience would be noise on a
 * screen whose whole job is the cards.
 */
const request = (): void => {
  void document.documentElement.requestFullscreen().catch(() => undefined);
};

export const useFullscreen = (): { offer: boolean; request: () => void } => {
  const [active, setActive] = useState(() => SUPPORTED && document.fullscreenElement !== null);

  useEffect(() => {
    if (!SUPPORTED) return;
    const sync = (): void => setActive(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return { offer: SUPPORTED && !active, request };
};
