import { useEffect, useRef } from "react";

/**
 * Take the shared-screen code away once a shared screen actually arrives. Two
 * surfaces show that code — the lobby dialog and the in-game invite (#135) — and
 * the rule wants to be the same on both.
 *
 * **It fires on the count going up, not on it being non-zero**, so it answers
 * the scan that just happened. `showing` is whether the shared-screen code is
 * the one on screen: the in-game invite also carries the player code, and a
 * screen arriving is no reason to shut a panel held out to a newcomer.
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
