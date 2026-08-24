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
 *
 * **It commits once, on the drop** (#321). It used to commit as it went: the
 * moment the gesture passed `THRESHOLD` it posted its hops and reset the offset
 * to zero, on the comment's reasoning that the label "is about to be redrawn at
 * its new spot". It is redrawn there only when the server's broadcast lands, a
 * round trip later — so until then the label was drawn at its **old** anchor with
 * no offset, snapping back to where the drag started, and once the broadcast did
 * land it was drawn at the *new* anchor plus everything the finger had travelled
 * since. Every further hop compounded it, so the error grew for as long as the
 * drag lasted and the name walked off the board. Measured at ×0.81: the label was
 * 26px above the top of the screen while still being held.
 *
 * Committing once removes the whole class of problem, because there is no
 * in-flight broadcast to be wrong about. It also means the hops can be counted
 * from where the room says the seat is *now* rather than from an index remembered
 * at the grab, which is strictly fresher.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import type { ClientMessage } from "@goleta/engine";

import { TABLE_DESIGN, designPoint, type Box, type Point } from "./fitScale.ts";
import { hopsBetween } from "./seatDrag.ts";
import { edgeSeats, nearestSeat, seatPoint } from "./tableEdges.ts";

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
  /** Where the label is drawn at rest — the same point a card drawn by this seat
   * is thrown at. The offset is worked out against this rather than against the
   * grab, so the thing being kept on the board is the label rather than the
   * finger. */
  anchor: Point;
}

/** Where a name sits at rest, or null if the board has no such seat. */
export const restingAt = (index: number, count: number, design: Box): Point | null => {
  const spot = edgeSeats(count)[index];
  return spot ? seatPoint(spot, design) : null;
};

/**
 * How far to draw a held name from where it sits at rest, kept on the board
 * (#321).
 *
 * Nothing clamped the label before, so "off the board" was "off the screen" — on
 * the one surface in this app whose job is telling a table who is sitting where.
 * It is the label's **centre** that is clamped, to the design box itself rather
 * than to some inset of it: a name at rest is already centred on a point inside
 * the bands at the very edge, so a name held against the edge overhangs by
 * exactly as much as a name sitting there does, and no more.
 *
 * Pure, and in design coordinates throughout, so it holds with the board
 * quarter-turned and at any `fitScale` — both of those live in `designPoint`,
 * which has already run by the time anything here is called.
 */
export const flungOffset = (anchor: Point, grab: Point, pointer: Point, design: Box): Point => {
  const wanted = { x: anchor.x + (pointer.x - grab.x), y: anchor.y + (pointer.y - grab.y) };
  const on = {
    x: Math.min(Math.max(wanted.x, 0), design.width),
    y: Math.min(Math.max(wanted.y, 0), design.height),
  };
  return { x: on.x - anchor.x, y: on.y - anchor.y };
};

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
      event.currentTarget.releasePointerCapture?.(event.pointerId);
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
      const anchor = restingAt(index, seats.length, design);
      if (!anchor) return;

      // Stops the press becoming a text selection, and on touch the beginning of
      // a pan before `touch-action` has had its say.
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      held.current = { id: seatId, from, anchor };
      setHolding(seatId);
      setOffset({ x: 0, y: 0 });
    },

    onDrag: (event) => {
      const state = held.current;
      if (!state) return;
      const now = at(event);
      if (!now) return;

      // The seat left mid-drag. Let go rather than hold a name nobody at the
      // table has any more.
      if (!seats.some((seat) => seat.id === state.id)) {
        release(event);
        return;
      }

      // Drawing only. Nothing is sent until the drop, so the label follows the
      // finger for the whole gesture and there is never a broadcast in flight for
      // it to be drawn wrongly against (#321).
      setOffset(flungOffset(state.anchor, state.from, now, design));
    },

    onDrop: (event) => {
      const state = held.current;
      const now = state ? at(event) : null;
      release(event);
      if (!state || !now) return;

      const moved = { x: now.x - state.from.x, y: now.y - state.from.y };
      if (Math.hypot(moved.x, moved.y) < THRESHOLD) return;

      // From where the room says the seat is *now*, which is the freshest thing
      // anybody here knows: nothing has been sent during this gesture, so there
      // is no instruction of our own in flight to count from instead.
      const from = seats.findIndex((seat) => seat.id === state.id);
      if (from === -1) return;

      const want = nearestSeat(now, seats.length, design);
      const { direction, count } = hopsBetween(from, want);

      // One message per place, exactly as the lobby's arrows send them.
      for (let hop = count; hop > 0; hop -= 1) {
        send({ t: "moveSeat", playerId: state.id, direction });
      }
    },
  };
};
