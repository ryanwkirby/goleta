/**
 * The beat a judged Sunny call gets, wherever it is being watched.
 *
 * A call is evidence before it's news: the pile peels back to the moment of the
 * reach with two cards marked, and only then is the ruling said out loud (#63).
 * That order is the whole point, and it has to be the same order on a player's
 * phone and on a screen in the middle of the table — so the timing lives here
 * rather than in either screen.
 *
 * It reads the log rather than the state because a judged call *is* an event:
 * it describes something that happened in the open, it is broadcast whole, and
 * nothing about it is held on `GameView`.
 */

import { useCallback, useEffect, useState } from "react";

import type { GameEvent } from "@goleta/engine";

import { PEEL_MS } from "../motion/plan.ts";
import type { LoggedEvent } from "../net/useGoleta.ts";

/** The event itself, narrowed to the one variant this is about. */
export type SunnyCalled = Extract<GameEvent, { type: "sunnyCalled" }>;

export interface JudgedCall {
  /** The most recent judged call, or null if this table has never had one. */
  call: SunnyCalled | null;
  /** Its place in the log. A new call is a new id, and that restarts the beat. */
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

  // The log is newest first, so this is the latest call and not the first one.
  const entry = log.find((logged) => logged.event.type === "sunnyCalled");
  const id = entry?.id;
  const call = entry?.event.type === "sunnyCalled" ? entry.event : null;

  useEffect(() => {
    if (id === undefined) return;
    setPeeling(true);
    const timer = setTimeout(() => {
      setPeeling(false);
      setAnnouncing(true);
    }, PEEL_MS);
    return () => clearTimeout(timer);
  }, [id]);

  const endAnnouncement = useCallback(() => setAnnouncing(false), []);

  return { call, id, peeling, announcing, endAnnouncement };
};
