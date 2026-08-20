/**
 * The size of a box, as the browser actually laid it out. Every fan here is
 * arithmetic on a real width rather than a guess at a phone.
 *
 * Content box, not border box, so nothing has to subtract an inset by hand. Zero
 * until the first observation, which every caller reads as "not measured yet".
 *
 * **It picks the element up whenever it arrives**, not only on the mount holding
 * it: a ref's `current` is a mutation rather than a dependency, so an effect
 * keyed on the ref runs once, with whatever was there at the time. That was
 * survivable until the upright table started measuring a row (#191) — `Table` is
 * the same component instance either side of a rotation, so a phone turned from
 * the hand view mounted a row nothing was watching and fanned against zero.
 */

import { useLayoutEffect, useState, type RefObject } from "react";

export interface Box {
  width: number;
  height: number;
}

export const useBox = (ref: RefObject<HTMLElement | null>): Box => {
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });
  const [element, setElement] = useState<HTMLElement | null>(null);

  // No dependency array: the point is to notice a `current` that changed without
  // anything having declared that it might.
  useLayoutEffect(() => {
    setElement((current) => (current === ref.current ? current : ref.current));
  });

  useLayoutEffect(() => {
    if (!element) return;
    const watch = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Whole pixels, and only when they change: a fractional resize that rounds to
      // the same layout should not re-run every fan on the screen.
      setBox((current) => {
        const next = { width: Math.floor(width), height: Math.floor(height) };
        return current.width === next.width && current.height === next.height ? current : next;
      });
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, [element]);

  return box;
};
