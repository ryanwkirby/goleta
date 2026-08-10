import { useEffect, useRef } from "react";

/**
 * Take the shared-screen code away once a shared screen actually arrives.
 *
 * The host scans it, the screen lights up across the table, and the panel
 * nobody is looking at any more used to sit there waiting for a tap. There are
 * two surfaces showing that code — the lobby's *Add a shared screen* dialog and
 * the in-game invite (#135) — and the rule wants to be the same on both, so it
 * lives here rather than twice.
 *
 * **It fires on the count going up, not on it being non-zero**, so it answers
 * the scan that just happened rather than a screen that was already propped
 * there when the panel opened. A table is allowed more than one.
 *
 * `showing` is whether the shared-screen code is the one on screen. The in-game
 * invite also carries the *player* code, and a screen arriving is no reason to
 * shut a panel somebody is holding out to a newcomer. The mark follows the
 * count whenever it isn't closing, so switching to the screen tab after one
 * joined doesn't shut the panel the instant it opens.
 */
export const useDismissOnScreenJoin = (
  screens: number,
  showing: boolean,
  onClose: () => void,
): void => {
  const mark = useRef(screens);

  useEffect(() => {
    if (showing && screens > mark.current) {
      onClose();
      return;
    }
    mark.current = screens;
  }, [screens, showing, onClose]);
};
