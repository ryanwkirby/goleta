/**
 * The beat the deck running out gets, wherever it is being watched (#209). It
 * used to be very nearly nothing on screen and people read it as the game
 * skipping ahead. The timing lives here for `useJudgedCall`'s reason: it is a
 * moment the whole table is in, and neither screen gets to decide it. It reads
 * the log rather than the state, because a reshuffle *is* an event.
 *
 * **Presentation, never rules**, and in particular **not a gate on the draw
 * pile**, which stays tappable throughout.
 */

import { useEffect, useState } from "react";

import type { GameEvent } from "@goleta/engine";

import { RESHUFFLE_MS } from "./beats.ts";
import type { LoggedEvent } from "./feed.ts";

/** The event itself, narrowed to the one variant this is about. */
export type Reshuffled = Extract<GameEvent, { type: "reshuffled" }>;

export interface Reshuffle {
  /** Null the rest of the time, which every caller reads as "say nothing". The
   * count rather than a boolean because the words carry it. */
  drawPileSize: number | null;
}

export const useReshuffle = (log: LoggedEvent[]): Reshuffle => {
  const [running, setRunning] = useState(false);

  // The log is newest first, so this is the latest reshuffle.
  const entry = log.find((logged) => logged.event.type === "reshuffled");
  const id = entry?.id;
  const event = entry?.event.type === "reshuffled" ? entry.event : null;

  useEffect(() => {
    if (id === undefined) return;
    setRunning(true);
    const timer = setTimeout(() => setRunning(false), RESHUFFLE_MS);
    return () => clearTimeout(timer);
  }, [id]);

  return { drawPileSize: running && event ? event.drawPileSize : null };
};
