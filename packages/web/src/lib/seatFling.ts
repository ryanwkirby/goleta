/**
 * Dragging a name to the edge its player is actually sitting at (#201).
 *
 * The lobby's arrows are a list; this is the same operation on the board
 * everybody is already looking at. **Position on that board is seat order**, and
 * seat order is turn order, so a name moved to another edge is a seat moved in
 * the order — there is no separate "where the name is drawn" to change.
 *
 * **It sends the message that already exists.** A drop three places round the
 * table is three `moveSeat` hops, for the reason `docs/PROTOCOL.md` gives: a
 * whole posted order can arrive after a seat has left, and a stale permutation is
 * a worse thing to reconcile than a swap that no longer applies. It is also what
 * makes a list changing mid-drag harmless — a hop is relative to wherever the
 * server has that seat.
 *
 * **A stray touch cannot reorder the table.** The gesture has to travel
 * `THRESHOLD` design pixels before anything is sent, because this screen is
 * propped in the middle of a table where somebody will put a drink down on it.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import type { ClientMessage } from "@goleta/engine";

import { TABLE_DESIGN, designPoint, type Box, type Point } from "./fitScale.ts";
import { hopsBetween } from "./seatDrag.ts";
import { nearestSeat } from "./tableEdges.ts";

/**
 * How far a finger has to travel before this is a drag rather than a tap. In
 * **design** pixels, so it is the same fraction of the board on a phone standing
 * in for a tablet as on a television — which is the point of there being one
 * design at all.
 */
export const THRESHOLD = 90;

export interface SeatFling {
  /** The seat under the finger, or null. */
  holding: string | null;
  /** How far it has been dragged, in design pixels, for the label to follow. */
  offset: Point;
  onGrab: (event: ReactPointerEvent<HTMLElement>, seatId: string) => void;
  onDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  onDrop: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface Held {
  id: string;
  /** Where the finger went down, in design coordinates. */
  from: Point;
  /** Where we have told the server this seat should be — not where the room says
   * it is. Those differ while a broadcast is in flight (`hopsBetween`). */
  at: number;
}

/**
 * `board` is the element carrying the transform, so the pointer can be put back
 * into design coordinates; `quarter` and `scale` are what that transform is.
 * Everything about the arithmetic lives in `designPoint` and `nearestSeat`, both
 * pure and both tested — this holds the gesture and nothing else.
 */
export const useSeatFling = ({
  board,
  scale,
  quarter,
  seats,
  send,
  enabled,
  design = TABLE_DESIGN,
}: {
  board: RefObject<HTMLElement | null>;
  scale: number;
  quarter: boolean;
  /** The table in the order it is sitting, which is the order it plays in. */
  seats: readonly { id: string }[];
  send: (message: ClientMessage) => void;
  /** An IRL room, between games. The server checks both again. */
  enabled: boolean;
  design?: Box;
}): SeatFling | null => {
  const held = useRef<Held | null>(null);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [holding, setHolding] = useState<string | null>(null);

  if (!enabled) return null;

  /** The pointer, in design coordinates. `null` before the board has a size. */
  const at = (event: ReactPointerEvent<HTMLElement>): Point | null => {
    const rect = board.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return designPoint(
      { x: event.clientX, y: event.clientY },
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      scale,
      quarter,
      design,
    );
  };

  const release = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    held.current = null;
    setHolding(null);
    setOffset({ x: 0, y: 0 });
  };

  return {
    holding,
    offset,
    onGrab: (event, seatId) => {
      const from = at(event);
      const index = seats.findIndex((seat) => seat.id === seatId);
      if (!from || index === -1) return;

      // Stops the press becoming a text selection, and on touch the beginning of
      // a pan before `touch-action` has had its say.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      held.current = { id: seatId, from, at: index };
      setHolding(seatId);
      setOffset({ x: 0, y: 0 });
    },

    onDrag: (event) => {
      const state = held.current;
      if (!state) return;
      const now = at(event);
      if (!now) return;

      // The seat left mid-drag. Let go rather than post hops about somebody who
      // is no longer at the table.
      if (!seats.some((seat) => seat.id === state.id)) {
        release(event);
        return;
      }

      const moved = { x: now.x - state.from.x, y: now.y - state.from.y };
      setOffset(moved);
      if (Math.hypot(moved.x, moved.y) < THRESHOLD) return;

      const want = nearestSeat(now, seats.length, design);
      const { direction, count } = hopsBetween(state.at, want);
      if (count === 0) return;

      // One message per place, exactly as the lobby's arrows send them.
      for (let hop = count; hop > 0; hop -= 1) {
        send({ t: "moveSeat", playerId: state.id, direction });
      }
      state.at = want;
      // The label is about to be redrawn at its new spot, so the offset restarts
      // from here. Without this it would keep measuring from the grab point and
      // the name would sit a whole edge away from the finger holding it.
      state.from = now;
      setOffset({ x: 0, y: 0 });
    },

    onDrop: release,
  };
};
