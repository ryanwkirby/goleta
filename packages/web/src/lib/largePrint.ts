/**
 * Large print: one player's own device drawn bigger, for anybody whose eyesight
 * makes the default unreadable (#323).
 *
 * **It is presentation, and unlike the hints it is private.** `packages/engine`
 * never learns it exists, it is not on `GameOptions` or `HouseRules`, no bot
 * reads it, and — the part that separates it from #187 — **nothing about it goes
 * on the wire at all**. Hints are shouted and mark the seat because taking help
 * is an advantage and #33 says taking it is never quiet. This says nothing about
 * anybody's hand and buys nobody a play they didn't have, so it is silent on and
 * silent off. Do not reach for `SeatView.hinted`'s machinery for it.
 *
 * **It is a context rather than a prop, and that is the one place it differs
 * from every other personal setting here.** `hints` is threaded through the
 * table because it *is* table state: `useTableState` puts it on the wire. This
 * is a fact about the device, like `MotionApi.reduced` next door — a dozen
 * components need it and none of them pass it on. The default is off, which is
 * also what the shared table screen gets: it fits one design to whatever it is
 * on (`fitScale.ts`), so "bigger" there mostly means less fits, and its own
 * legibility problem is #320.
 */

import { createContext, useContext, useLayoutEffect } from "react";

/**
 * What large print multiplies by.
 *
 * It is applied in exactly two ways and they have to agree to the pixel. The
 * root font size is set to `ROOT_PX * LARGE_SCALE`, which takes every rem in the
 * app — type, padding, controls, and the whole of `SIZES` in `Card.tsx` — up
 * with it; and every **pixel** constant that mirrors one of those rems is
 * multiplied by the same number by hand. `cardLadder.test.ts` is what stops the
 * two drifting, because nothing else would fail if they did.
 *
 * 1.3 rather than something rounder: it is a real difference at a glance and it
 * still leaves the seat strip, the peek strip and the header laid out the way
 * they were, with rows and scrolling as the release valve (#59).
 */
export const LARGE_SCALE = 1.3;

/** The browser's own default, which this app has never moved off. */
export const ROOT_PX = 16;

export const printScale = (large: boolean): number => (large ? LARGE_SCALE : 1);

export interface LargePrintApi {
  on: boolean;
  /** Written straight through to `localStorage` by whoever provides this. */
  choose: (on: boolean) => void;
}

export const LargePrintContext = createContext<LargePrintApi>({
  on: false,
  choose: () => {},
});

export const useLargePrint = (): LargePrintApi => useContext(LargePrintContext);

/** The number to multiply a pixel constant by. The reading half of the context,
 * which is what all but three callers want. */
export const usePrintScale = (): number => printScale(useLargePrint().on);

/**
 * The root font size, which is the whole of how the rest of the app grows.
 *
 * Set on the element rather than in the stylesheet so it is a property that can
 * be removed again: a browser that has never turned this on has no inline style
 * at all and is byte-for-byte the app it was. Nothing else may write
 * `documentElement.style.fontSize`.
 */
export const useLargePrintRoot = (on: boolean): void => {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!on) return;
    root.style.fontSize = `${ROOT_PX * LARGE_SCALE}px`;
    return () => {
      root.style.removeProperty("font-size");
    };
  }, [on]);
};
