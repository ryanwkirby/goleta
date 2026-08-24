/**
 * Room below a full-height screen for a downward drag to go, so the browser's
 * own chrome retracts (#327).
 *
 * On Chrome for Android the URL bar never collapsed in this app, so every screen
 * was permanently short by its height — and in landscape that comes straight off
 * the cards, since `handHeight` returns the room the row is left (#131, #166).
 * The bar collapses on a user scroll of the **root scroller**, and nothing here
 * scrolled: both screens are `h-dvh` with `overflow-hidden`, `#root` is a
 * `min-height: 100%` flex column, and an inner `overflow-y: auto` will not do it.
 *
 * **The screen is pinned and the spacer sits after it.** The screen keeps its
 * `h-dvh` and takes `sticky top-0`; this is its next sibling in `#root`. So the
 * whole of the scroll is absorbed — the screen stays stuck to the top of the
 * viewport for the entire range and this is never actually seen — and **nothing
 * shifts the cards under a thumb** (#131), because the room comes from below the
 * screen rather than out of it. When the bar does go, `dvh` re-measures, the
 * screen grows into it, and the boxes settle on their own: the hand's `useBox`
 * and the shared screen's `contentBox` are both `ResizeObserver`s, so neither is
 * fighting the animation (#285).
 *
 * `body`'s `overscroll-behavior-y: none` stays exactly as it is. It stops the
 * rubber-banding past the ends of a scroll rather than the scroll itself, so it
 * is not what was blocking the collapse and the table still feels like a surface.
 *
 * **Not a replacement for fullscreen.** `lib/fullscreen.ts` still offers that
 * properly wherever `requestFullscreen` exists, from the peek strip's left
 * cluster, and takes itself away once fullscreen is held. This is the fallback
 * for where it is not on offer, and for the shared screen, which has no such
 * control outside the waiting state's install pilot (#126). Nothing here reaches
 * for `screen.orientation.lock()` (#125).
 */

import { SCROLL_RELEASE_PX, useRetractableChrome } from "../lib/viewport.ts";

export function ScrollRelease() {
  const retracts = useRetractableChrome();
  // Nothing at all where the chrome cannot retract, so a laptop does not grow
  // 72px of scrollable felt to solve a problem it does not have.
  if (!retracts) return null;
  return <div aria-hidden className="shrink-0" style={{ height: SCROLL_RELEASE_PX }} />;
}
