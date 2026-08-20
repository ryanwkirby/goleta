/**
 * Where each seat's name goes on the shared table screen, and which way up. A
 * name has to be readable *by the person sitting at that edge*, which until #141
 * was exactly 180° out on all four sides. Pure arithmetic, no DOM.
 */

import type { Box, Point } from "./fitScale.ts";

export type Edge = "top" | "right" | "bottom" | "left";

/** Seat order is turn order, so this walks the table the way play does — which
 * is what makes a card fly in the direction that player is. */
export const edgeFor = (index: number, count: number): Edge => {
  const t = count <= 1 ? 0 : index / count;
  if (t < 0.25) return "top";
  if (t < 0.5) return "right";
  if (t < 0.75) return "bottom";
  return "left";
};

/** Bottom is upright; every other edge is a quarter turn away in the direction
 * you would walk round the table. */
export const TURN_FOR: Record<Edge, number> = { bottom: 0, left: 90, top: 180, right: -90 };

/** The strips round the edge that belong to the names. The bottom is deeper
 * because it shares with the turn prompt; the top corners hold the room code and
 * the view toggle. */
export const BAND = { top: 48, bottom: 48, side: 56, corner: 120 };

/** Capped by the tightest edge, which is a **side**: two labels down 560 with a
 * band at each end start touching at 224. At the old 192 the screen clipped
 * `Bartholomew` at eight characters (#161). */
export const LABEL = 216;

export interface EdgeSeat {
  edge: Edge;
  /** Percentage along that edge, left-to-right / top-to-bottom. */
  along: number;
}

/** The bottom edge shares its band with the centred prompt, so names there are
 * pushed to the corners. Every other place for the prompt costs the piles
 * height, which is the board's *width* once it is turned. */
/** The corners hold the room code and the view toggle, and a wider label reaches
 * further into them (#161). */
const TOP_ENDS = { lone: 24, pair: [24, 76] };
const BOTTOM_ENDS = { lone: 12, pair: [12, 88] };
const CENTRED = { lone: 50, pair: [30, 70] };

/** Laid out per edge rather than by index arithmetic, so two seats on one edge
 * are spread across it and a lone seat is placed on its own terms. */
/** Exported because the flight aims at these spots too: it used to have its own
 * vectors from the middle of the board, which threw a card at the midpoint
 * between two people (#164). */
export const ACROSS: Record<Edge, number> = {
  top: BAND.top / 2,
  bottom: 36,
  left: 28,
  right: 28,
};

/** One answer, read both by what draws the names and by what throws cards at
 * them. */
export const seatPoint = (spot: EdgeSeat, design: Box): Point => {
  const across = ACROSS[spot.edge];
  switch (spot.edge) {
    case "top":
      return { x: (spot.along / 100) * design.width, y: across };
    case "bottom":
      return { x: (spot.along / 100) * design.width, y: design.height - across };
    case "left":
      return { x: across, y: (spot.along / 100) * design.height };
    case "right":
      return { x: design.width - across, y: (spot.along / 100) * design.height };
  }
};

export const edgeSeats = (count: number): EdgeSeat[] => {
  const edges = Array.from({ length: Math.max(count, 0) }, (_, index) => edgeFor(index, count));

  const placed: EdgeSeat[] = [];
  for (const [index, edge] of edges.entries()) {
    const onEdge = edges.reduce<number[]>((all, candidate, at) => {
      if (candidate === edge) all.push(at);
      return all;
    }, []);
    const slot = onEdge.indexOf(index);
    /**
     * Which end of the edge this seat gets, walking **clockwise**. `along` runs
     * left-to-right and top-to-bottom, which is play's direction on the top and
     * right edges and the opposite on the other two. In raw `along` order seats
     * 3 and 4 sat the wrong way round on a table of six, and since #164 that
     * threw a drawn card to the wrong corner too (#186).
     */
    const end = edge === "bottom" || edge === "left" ? onEdge.length - 1 - slot : slot;
    const spread = edge === "top" ? TOP_ENDS : edge === "bottom" ? BOTTOM_ENDS : CENTRED;
    placed.push({
      edge,
      along: onEdge.length <= 1 ? spread.lone : (spread.pair[end] ?? spread.lone),
    });
  }
  return placed;
};
