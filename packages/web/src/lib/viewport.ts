/**
 * What kind of screen this is, and which way up it is being held. Both answers
 * come from `matchMedia` rather than a resize heuristic, which fires on the
 * keyboard opening and on the address bar sliding away.
 *
 * Nothing here reads the user agent: a portrait iPad and a narrow desktop window
 * are not phones, and neither is anything that merely *says* it is.
 */

import { useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";

/** Three plain queries rather than one with `and`/`or`: `matchMedia` answers a
 * query it can't parse with a flat "no", which would quietly turn IRL mode off
 * on an older phone rather than fail where anybody could see it. */
const COARSE = "(pointer: coarse)";
const NARROW = "(max-width: 500px)";
const SHORT = "(max-height: 500px)";
const PORTRAIT = "(orientation: portrait)";

const useMedia = (query: string): boolean => {
  const subscribe = useMemo(
    () => (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
};

/**
 * A coarse pointer on a screen whose short side is under 500px. Short side
 * rather than width, so it gives the same answer with the phone held either way
 * — and a tablet clears 500 on both sides, which is what keeps it out of the
 * rotate prompt.
 */
export const useIsPhone = (): boolean => {
  const coarse = useMedia(COARSE);
  const narrow = useMedia(NARROW);
  const short = useMedia(SHORT);
  return coarse && (narrow || short);
};

export const useIsPortrait = (): boolean => useMedia(PORTRAIT);

/**
 * A screen with no height to spare — a phone held sideways, and a laptop window
 * dragged short.
 *
 * Asked on height rather than on orientation because height is what the callers
 * are short of: a panel that pins a footer under a scrolling body has the same
 * problem in a 420px browser window as it does in landscape, and
 * `(orientation: landscape)` would answer *no* to one of those and *yes* to a
 * 1200px-tall desktop with room for everything (#305).
 */
export const useIsShort = (): boolean => useMedia(SHORT);

/**
 * How much room to leave below a screen that fills the viewport, so a downward
 * drag has somewhere to go and the browser's own chrome retracts (#327).
 *
 * On Chrome for Android the URL bar never collapsed in this app, so every screen
 * was permanently short by its height — and in landscape that comes straight off
 * the cards, since `handHeight` returns the room the row is left (#131, #166).
 * The bar collapses on a user scroll of the **root scroller**, and nothing here
 * scrolls: the two screens are `h-dvh` with `overflow-hidden`, `#root` is a
 * `min-height: 100%` flex column, and an inner `overflow-y: auto` will not do it.
 *
 * Comfortably more than a URL bar, because the browser retracts its chrome in
 * proportion to the scroll and a spacer exactly its height would need the gesture
 * run to the very end.
 */
export const SCROLL_RELEASE_PX = 72;

/** `100svh` is the viewport with the browser's bars showing and `100lvh` is the
 * viewport without them. */
const viewportUnit = (unit: string): number => {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:100${unit}`;
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
};

/**
 * Whether this browser has chrome that retracts on a scroll at all.
 *
 * A **capability**, asked of the viewport rather than of a user agent (#124):
 * a browser whose bars never move answers the two questions above with the same
 * number, and gets no spacer — so a laptop does not grow 72px of scrollable felt
 * to solve a problem it does not have. iOS Safari's bars behave differently from
 * Chrome's and this says nothing about how well the trick works there; what it
 * rules out is doing it where it cannot possibly help.
 *
 * Measured once. Whether a browser has a retracting bar is a property of the
 * browser, not of the moment — and asking again on every resize would be asking
 * during the very animation this is about.
 */
export const useRetractableChrome = (): boolean => {
  const [retracts, setRetracts] = useState(false);
  useLayoutEffect(() => {
    setRetracts(viewportUnit("lvh") - viewportUnit("svh") > 1);
  }, []);
  return retracts;
};
