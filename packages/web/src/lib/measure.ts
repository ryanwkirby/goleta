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
 *
 * **It picks the element up whenever it arrives, not only on the mount that
 * happens to be holding it.** A ref's `current` is a mutation rather than a
 * dependency, so an effect keyed on the ref runs exactly once — with whatever
 * was there at the time, very often `null`. That was survivable while the only
 * caller drew its row unconditionally, and stopped being survivable the moment
 * the upright table started measuring one (#191): `Table` is the same component
 * instance either side of a rotation, so a phone turned from the hand view to
 * the full table mounted a row that nothing was watching, and a watcher taking
 * a seat between games mounted another. Both fanned against a width of zero.
 *
 * So the element is tracked in state, refreshed after every commit. React bails
 * out of an identical `setState`, so the steady case is a comparison and no
 * re-render at all; the arrival of a row costs one.
 */

import { useLayoutEffect, useState, type RefObject } from "react";

export interface Box {
  width: number;
  height: number;
}

export const useBox = (ref: RefObject<HTMLElement | null>): Box => {
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });
  const [element, setElement] = useState<HTMLElement | null>(null);

  // No dependency array: the whole point is to notice a `current` that changed
  // without anything having declared that it might.
  useLayoutEffect(() => {
    setElement((current) => (current === ref.current ? current : ref.current));
  });

  useLayoutEffect(() => {
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
  }, [element]);

  return box;
};
