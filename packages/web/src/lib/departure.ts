/**
 * Somebody leaving the table, said on the prompt line for a few seconds (#256).
 *
 * The same shape as `useReshuffle`, for the same reason: the prompt line is the
 * one surface all three screens have, and a departure is a table-level fact
 * rather than something either screen gets to decide the length of. It reads the
 * log, because leaving *is* an event.
 *
 * **It gates nothing.** The seat keeps its cards and the autopilot plays them
 * out underneath this, exactly as the bots move under a reshuffle.
 */

import { useEffect, useState } from "react";

import { DEPARTURE_MS } from "./beats.ts";
import { type LoggedEvent, stillNews } from "./feed.ts";

/** The player who has just gone, or null the rest of the time — which every
 * caller reads as "say nothing". */
export const useDeparture = (log: LoggedEvent[]): string | null => {
  const [running, setRunning] = useState(false);

  // The log is newest first, so this is the most recent departure.
  const entry = log.find((logged) => logged.event.type === "left");
  const id = entry?.id;
  const at = entry?.at;
  const playerId = entry?.event.type === "left" ? entry.event.playerId : null;

  useEffect(() => {
    // Said once, when it happens — not again every time the table is mounted
    // afresh, which closing the rules screen does (#357).
    if (!stillNews(entry, DEPARTURE_MS, Date.now())) return;
    setRunning(true);
    const timer = setTimeout(() => setRunning(false), DEPARTURE_MS);
    return () => clearTimeout(timer);
  }, [id, at]);

  return running ? playerId : null;
};
