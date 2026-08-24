/**
 * The beat a judged Sunny call gets, wherever it is being watched.
 *
 * A call is evidence before it's news: the pile peels back to the reach with two
 * cards marked, and only then is the ruling said out loud (#63). That order has
 * to be the same on a phone and on the screen in the middle of the table, so the
 * timing lives here rather than in either screen. It reads the log rather than
 * the state because a judged call *is* an event.
 */

import { useCallback, useEffect, useState } from "react";

import type { GameEvent } from "@goleta/engine";

import { ANNOUNCE_MS, PEEL_MS } from "./beats.ts";
import { type LoggedEvent, stillNews } from "./feed.ts";

/** The event itself, narrowed to the one variant this is about. */
export type SunnyCalled = Extract<GameEvent, { type: "sunnyCalled" }>;

/** How long a call stays news. Its own beat, end to end: come back part-way
 * through one and you are owed it from the top, come back after it and the log
 * is where it lives (#357). The offender's dialog waits on a tap rather than a
 * timer, and that tail is the offender waiting rather than the moment lasting,
 * so it is not in here. */
export const CALL_NEWS_MS = PEEL_MS + ANNOUNCE_MS;

export interface JudgedCall {
  /** The call this screen is showing, or null — which includes a call that was
   * judged while nobody was looking at this screen. */
  call: SunnyCalled | null;
  /** Its place in the log. A new call is a new id, which restarts the beat, and
   * `caughtState` compares it against the dialog the offender has dismissed. */
  id: number | undefined;
  /** The pile is rewound and the evidence is up. */
  peeling: boolean;
  /** The evidence has gone and the ruling is being said. */
  announcing: boolean;
  /** Ends the announcement early — a dialog dismissed, or a timer run out. */
  endAnnouncement: () => void;
}

export const useJudgedCall = (log: LoggedEvent[]): JudgedCall => {
  const [peeling, setPeeling] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  /**
   * The call this screen took up, which is not the same as the newest one in the
   * log: the log outlives the table, and closing the rules screen mounts a fresh
   * one (#357). Kept here rather than derived on every render because the answer
   * has to stop moving once the beat has started — a ruling that vanished
   * mid-sentence the moment the window passed would be a worse bug than the one
   * this fixes.
   */
  const [showing, setShowing] = useState<number | undefined>(undefined);

  // The log is newest first, so this is the latest call.
  const entry = log.find((logged) => logged.event.type === "sunnyCalled");
  const id = entry?.id;
  const at = entry?.at;
  const event = entry?.event.type === "sunnyCalled" ? entry.event : null;

  useEffect(() => {
    if (!stillNews(entry, CALL_NEWS_MS, Date.now())) return;
    setShowing(id);
    setPeeling(true);
    const timer = setTimeout(() => {
      setPeeling(false);
      setAnnouncing(true);
    }, PEEL_MS);
    return () => clearTimeout(timer);
  }, [id, at]);

  const endAnnouncement = useCallback(() => setAnnouncing(false), []);

  // The call this screen is showing, rather than the newest one there has been.
  // Both go out, because a null here is what keeps the offender's dialog from
  // being raised again over a punishment already taken: `caughtState` reads it.
  const shown = showing === id ? id : undefined;
  const call = shown === undefined ? null : event;

  return { call, id: shown, peeling, announcing, endAnnouncement };
};
