/**
 * What kind of screen this is, and which way up it is being held. Both answers
 * come from `matchMedia` rather than a resize heuristic, which fires on the
 * keyboard opening and on the address bar sliding away.
 *
 * Nothing here reads the user agent: a portrait iPad and a narrow desktop window
 * are not phones, and neither is anything that merely *says* it is.
 */

import { useMemo, useSyncExternalStore } from "react";

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
