/**
 * Copying a link, and the moment of feedback that says it worked.
 *
 * **Two triggers, one piece of state** (#243). A code is the address of a room,
 * and the two places one is drawn — the lobby and the in-game invite — each draw
 * it twice: the characters, and a copy glyph beside them (#366). Whichever is
 * pressed, the glyph shows a tick for the same moment, because two independent
 * copies of that state would let the feedback disagree with what just happened.
 *
 * **A clipboard that refuses is swallowed.** `copied` stays false, so nothing
 * ever claims something that did not happen — `navigator.clipboard` throws on
 * an insecure origin and on a browser that has not granted it.
 */

import { useEffect, useRef, useState } from "react";

/** Long enough to read, short enough that a second copy is not confusing. */
export const COPIED_MS = 1800;

export const useCopyLink = (link: string): { copied: boolean; copy: () => void } => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The in-game panel toggles between the player link and the shared-screen one
  // under a standing "Link copied", which would then be about the other link.
  useEffect(() => {
    setCopied(false);
  }, [link]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = (): void => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      } catch {
        setCopied(false);
      }
    })();
  };

  return { copied, copy };
};
