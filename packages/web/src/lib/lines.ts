/**
 * How many lines a block of text actually came out as, which is a question only
 * the browser can answer.
 *
 * The one caller is the landing header (#433), where two sentences are two
 * `<p>`s and a half-line goes between them once the pair has wrapped past two
 * lines. Where the wrap falls is a font-metrics question — it depends on the
 * face the device has, the width it has, and whether large print is on — so
 * nothing here may be a width the app writes down and compares against.
 *
 * **It counts the children rather than the block**, and that is the whole of why
 * this is not two lines of arithmetic inline. The gap the count decides on is
 * *inside* the block, so a count taken off the block's own height would include
 * the space it had just caused and could never go back: three lines at 24 plus a
 * 12px gap is 84, which is still more than two lines, and two lines plus the gap
 * is 60, which is also more than two lines. The children's heights are the same
 * either way.
 */

import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * Lines, given each child's laid-out height and the line height they share.
 *
 * A child is at least one line: a paragraph that has not been laid out yet
 * measures zero, and counting it as nothing would say a two-sentence block is
 * shorter than a one-sentence one. Rounding rather than flooring, because a
 * fractional line height is normal and 47.98 of a 24 is two lines.
 */
export const lineCount = (heights: readonly number[], lineHeight: number): number =>
  lineHeight > 0
    ? heights.reduce((lines, height) => lines + Math.max(1, Math.round(height / lineHeight)), 0)
    : heights.length;

/**
 * The same count, off a live element, remeasured whenever it resizes.
 *
 * It picks the element up whenever it arrives rather than on the mount holding
 * it, for `useBox`'s reason: a ref's `current` is a mutation rather than a
 * dependency.
 */
export const useLineCount = (ref: RefObject<HTMLElement | null>): number => {
  const [lines, setLines] = useState(0);
  const [element, setElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setElement((current) => (current === ref.current ? current : ref.current));
  });

  useLayoutEffect(() => {
    if (!element) return;
    const read = (): void => {
      // `normal` gives NaN, which `lineCount` reads as "no line height to divide
      // by" and answers with one line per child — the unwrapped answer, which is
      // the one that changes nothing.
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      const heights = [...element.children].map((child) => child.getBoundingClientRect().height);
      const next = lineCount(heights, lineHeight);
      setLines((current) => (current === next ? current : next));
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(element);
    return () => watch.disconnect();
  }, [element]);

  return lines;
};
