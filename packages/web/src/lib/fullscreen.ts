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

/**
 * Whether the browser is keeping a strip of this screen for itself.
 *
 * Three ways it isn't: the page holds fullscreen, the page was launched from a
 * home screen (`display-mode`), or iOS says the same thing in its own words.
 * All three are capability questions and none of them is a user agent — the
 * same rule the install pilot follows.
 *
 * The one thing that reads it is `TableRotateNudge` (#141): a phone standing in
 * for a spare tablet loses far more of a landscape screen to the address bar
 * than an upright one, and it is only worth asking anybody to turn a device
 * over when there is a bar to get out of the way. Held fullscreen, or installed,
 * both ways up give the same rectangle and the ask would be noise.
 */
const withoutChrome = (): boolean =>
  document.fullscreenElement !== null ||
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const useBrowserChrome = (): boolean => {
  const [chrome, setChrome] = useState(() => !withoutChrome());

  useEffect(() => {
    const sync = (): void => setChrome(!withoutChrome());
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("visibilitychange", sync);
    // The bar sliding away is a resize and nothing else, and a phone being
    // turned over is one too — both change the answer this is asked for.
    window.addEventListener("resize", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return chrome;
};
