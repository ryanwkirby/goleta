/**
 * The size of a box, as the browser actually laid it out.
 *
 * Every fan in this app is arithmetic on a real width rather than a guess at a
 * phone — `fan.ts` for the seat strip, `handFan.ts` for your own hand and for
 * the accusation picker — and all of them need the same two numbers first. The
 * measuring is the boring half, so it lives here once.
 *
 * Content box, not border box: what is measured is the room the cards get, with
 * the padding already taken off, so nothing has to subtract an inset by hand and
 * disagree about it. Zero until the first observation, which every caller reads
 * as "not measured yet" and draws its loosest layout for one frame.
 */

import { useLayoutEffect, useState, type RefObject } from "react";

export interface Box {
  width: number;
  height: number;
}

export const useBox = (ref: RefObject<HTMLElement | null>): Box => {
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const watch = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Whole pixels, and only when they change: a fractional resize that
      // rounds to the same layout should not re-run every fan on the screen.
      setBox((current) => {
        const next = { width: Math.floor(width), height: Math.floor(height) };
        return current.width === next.width && current.height === next.height ? current : next;
      });
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, [ref]);

  return box;
};
