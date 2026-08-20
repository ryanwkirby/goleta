/**
 * Offering a phone the rest of its screen, in the view that wants it. It
 * **cannot be asked for programmatically**, so there has to be something to tap
 * where the orientation this is about can reach it; it **does not stay taken**,
 * so the offer has to come back on its own; and **half the phones in the world
 * do not have it**, so an iPhone gets no control rather than a dead one.
 *
 * **Nothing here locks orientation** — that would freeze the app's only view
 * switch, and fullscreen survives a rotation on its own (#125).
 */

import { useEffect, useState } from "react";

/** Feature-detected, never sniffed, and read once — nothing about it changes
 * while a page is open. */
const SUPPORTED = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

/** `offer` is false while fullscreen is held, so the control disappears when it
 * is taken and returns when the browser hands it back. `visibilitychange` covers
 * the drop landing while nobody is watching. */
/** Failure is silent: an error banner about an optional convenience would be
 * noise on a screen whose whole job is the cards. */
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
 * Whether the browser is keeping a strip of this screen for itself: fullscreen,
 * launched from a home screen, or iOS saying the same in its own words. All
 * capability questions, no user agents.
 *
 * Read by `TableRotateNudge` (#141) — it is only worth asking anybody to turn a
 * device over when there is a bar to get out of the way.
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
    // The bar sliding away is a resize, and so is the phone being turned over.
    window.addEventListener("resize", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return chrome;
};
