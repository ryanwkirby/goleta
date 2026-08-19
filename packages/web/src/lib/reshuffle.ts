/**
 * The beat the deck running out gets, wherever it is being watched (#209).
 *
 * Shuffling the face-up pile back in is one of the biggest things that happens
 * in a game, and on screen it used to be very nearly nothing: the deck count
 * jumped back up, the pile dropped to a single card, the card to match changed,
 * and play carried on. People at the table read it as the game skipping ahead
 * and asked what had happened.
 *
 * So it gets about five seconds — cards going back into the deck slowly enough
 * to watch, and the words to say why — and the timing lives here for exactly
 * the reason `useJudgedCall` does: it is the length of a moment the whole table
 * is in, and it has to be the same length on a phone in either orientation and
 * on the screen in the middle of the table. Neither screen gets to decide it.
 *
 * It reads the log rather than the state, because a reshuffle *is* an event: it
 * describes something that happened in the open, it is broadcast whole, and
 * `GameView` carries no trace of it having just occurred.
 *
 * **It is presentation and never rules.** Nothing on the server changes, no
 * engine event is added, and bot pacing is untouched — bots may well move while
 * the beat is still running, exactly as they do under the peel. In particular
 * it is **not a gate on anything, least of all the draw pile**, which stays
 * tappable throughout with no disabled state and no warning. Five seconds of
 * animation is a tempting place to quietly break the first rule in
 * `AGENTS.md`'s "Rules that look like bugs"; it isn't one.
 */

import { useEffect, useState } from "react";

import type { GameEvent } from "@goleta/engine";

import { RESHUFFLE_MS } from "../motion/plan.ts";
import type { LoggedEvent } from "../net/useGoleta.ts";

/** The event itself, narrowed to the one variant this is about. */
export type Reshuffled = Extract<GameEvent, { type: "reshuffled" }>;

export interface Reshuffle {
  /**
   * How many cards there are to draw, while the beat is running — and `null`
   * the rest of the time, which is what every caller reads as "say nothing".
   *
   * The count rather than a bare boolean because the words carry it, and
   * `drawPileSize` is already on the wire.
   */
  drawPileSize: number | null;
}

export const useReshuffle = (log: LoggedEvent[]): Reshuffle => {
  const [running, setRunning] = useState(false);

  // The log is newest first, so this is the latest reshuffle and not the first.
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
