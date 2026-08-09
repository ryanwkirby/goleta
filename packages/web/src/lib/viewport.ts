/**
 * What kind of screen this is, and which way up it is being held.
 *
 * Both answers come from `matchMedia` rather than from watching `resize` and
 * comparing numbers. A resize heuristic fires on the keyboard opening, on the
 * address bar sliding away mid-scroll, and on nothing at all in a desktop
 * window being dragged — none of which is a phone being turned over.
 *
 * Nothing here reads the user agent. A portrait iPad and a narrow desktop
 * window are not phones, and neither is anything that merely *says* it is: the
 * two things IRL mode actually cares about are whether there is a finger doing
 * the tapping and whether the screen is small enough that the full table stops
 * being readable.
 */

import { useMemo, useSyncExternalStore } from "react";

/**
 * Deliberately three plain queries rather than one with `and`/`or` in it.
 * Media Queries Level 4 syntax is fine on anything current, but `matchMedia`
 * answers a query it can't parse with a flat "no" — which would quietly turn
 * IRL mode off on an older phone rather than fail where anybody could see it.
 */
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
 * A phone, near enough: a coarse pointer on a screen whose short side is under
 * 500px.
 *
 * Short side rather than width, because this has to give the same answer with
 * the phone held either way — a landscape phone is wide and short, a portrait
 * one is narrow and tall, and both are the same device. A tablet propped at the
 * table clears 500px on both sides whichever way it is turned, which is what
 * keeps it out of the rotate prompt: a tablet at a table is a table screen.
 */
export const useIsPhone = (): boolean => {
  const coarse = useMedia(COARSE);
  const narrow = useMedia(NARROW);
  const short = useMedia(SHORT);
  return coarse && (narrow || short);
};

export const useIsPortrait = (): boolean => useMedia(PORTRAIT);
