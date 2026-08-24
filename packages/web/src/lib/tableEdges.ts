/**
 * Where each seat's name goes on the shared table screen, how big it is, and
 * which way up. A name has to be readable *by the person sitting at that edge*,
 * which until #141 was exactly 180° out on all four sides. Pure arithmetic, no
 * DOM.
 *
 * **The places are computed rather than written down** (#320). They used to be
 * four tables of fixed percentages, which worked only because every name was the
 * same small size: `24%`/`76%` on the top edge is a sentence about a 216px label
 * and says nothing about a 300px one. Now each edge is given the span it may use,
 * the label's length is subtracted from both ends, and what is left is shared out
 * — so a bigger name is a change to one number rather than to four tables, and
 * the property the tests hold (nothing overlaps anything) is the arithmetic
 * itself rather than a coincidence between constants.
 */

import { TABLE_DESIGN, type Box, type Point } from "./fitScale.ts";

export type Edge = "top" | "right" | "bottom" | "left";

export const edgeFor = (index: number, count: number): Edge => {
  const t = count <= 1 ? 0 : index / count;
  if (t < 0.25) return "top";
  if (t < 0.5) return "right";
  if (t < 0.75) return "bottom";
  return "left";
};

export const TURN_FOR: Record<Edge, number> = { bottom: 0, left: 90, top: 180, right: -90 };

/** How much air a name keeps from whatever is at the end of its span. Small: the
 * spans below are already the room that is *left*, so this is only what stops a
 * label sitting flush against a band. */
const PAD = 8;

/**
 * How the names round the board are drawn, at a size the ring has room for.
 *
 * **`text-2xl` on a `bg-felt-950/40` pill was a phone's type size and a phone's
 * contrast**, on the one surface in this app that is read from the far side of a
 * table, over the shoulders of the people sitting at it (#320).
 *
 * Names cannot both double and go anywhere, and the arithmetic is worth having
 * written down. The tightest edge is the **bottom**, which shares its band with
 * the centred prompt (#141): a name has to fit in the flank left either side of
 * it, so the prompt and the label are trading against one number. After that come
 * the **sides**, where two names run lengthwise down 560 less two bands. The top
 * is the roomiest and never binds.
 *
 * So the size is a **ladder chosen from the seat count** — the largest rung the
 * ring has room for. Four to six seats put at most one name on each side edge and
 * take the large rung; seven and eight put two on a side, where two big labels
 * simply do not fit, and stay exactly where they were. That is the honest answer
 * rather than a failure: a name too small to read is the thing this was fixing,
 * arriving by another route, and a full table pays for its own crowding rather
 * than making a table of four pay for it.
 *
 * The **colour** is not on the ladder, because it costs nothing: every rung lifts
 * the resting names off the felt. The seat on the clock is amber and stays the
 * loudest thing on the board.
 */
export interface NameRung {
  /** The label's type size, in design pixels. */
  size: number;
  /** Its line height, also in design pixels. Stated rather than left to a class,
   * because the band arithmetic below needs the pill's real height and a rung is
   * the one place that knows it. */
  line: number;
  /** The longest a label may be along its own edge. It truncates to this. */
  label: number;
  /** The strips round the edge that belong to the names. The bottom is deeper
   * because it shares with the turn prompt; the top corners hold the room code
   * and the view toggle. */
  band: { top: number; bottom: number; side: number; corner: number };
  /** How far in from its own edge a name's centre line sits. */
  across: Record<Edge, number>;
  /** The widest the centred prompt in the bottom band may be. */
  prompt: number;
}

/**
 * Four to six seats. The prompt comes down from 512 to 360 to make the flanks
 * either side of it wide enough for a label, which costs a Sunny ruling about one
 * more line, and the deeper bands cost the centre piles roughly a tenth through
 * `pileBox` and `fitScale`. Both are the trade this rung is: a name nobody can
 * read across a table is worth less than either.
 */
const LARGE: NameRung = {
  size: 44,
  line: 52,
  label: 296,
  band: { top: 72, bottom: 80, side: 72, corner: 120 },
  across: { top: 36, bottom: 44, left: 36, right: 36 },
  prompt: 360,
};

/** Seven or eight. Two names down one side is what rules the large rung out, and
 * every figure here is the board exactly as it was before #320 — so a full table
 * is no worse off than it was, and gets the colour anyway. */
const SMALL: NameRung = {
  size: 24,
  line: 32,
  label: 216,
  band: { top: 48, bottom: 48, side: 56, corner: 120 },
  across: { top: 24, bottom: 36, left: 28, right: 28 },
  prompt: 512,
};

/** The `py-1` the pill keeps above and below its line. */
const PILL_PAD = 8;

/** How tall a name's pill is, measured rather than guessed: `text-2xl` with
 * `py-1` comes out at exactly 40 design pixels on the board. */
export const pillHeight = (rung: NameRung): number => rung.line + PILL_PAD;

/** How many of `count` seats land on `edge`. */
export const seatsOn = (edge: Edge, count: number): number =>
  Array.from({ length: Math.max(count, 0) }, (_, index) => edgeFor(index, count)).filter(
    (candidate) => candidate === edge,
  ).length;

/**
 * The largest rung this many seats leave room for. A property of the count alone,
 * so every screen looking at the same room draws the same board.
 */
export const nameRung = (count: number): NameRung =>
  seatsOn("left", count) > 1 || seatsOn("right", count) > 1 ? SMALL : LARGE;

export interface EdgeSeat {
  edge: Edge;
  /** How far along its own edge, as a percentage of that edge's length. */
  along: number;
  /** How far in from that edge, in design pixels. Carried on the seat rather
   * than looked up, so `seatPoint` keeps its signature while the bands move with
   * the rung. */
  across: number;
}

/**
 * The stretch of an edge the names may use, in design pixels along that edge.
 * The bottom has two, because the prompt is centred in the middle of it.
 */
const spansOf = (edge: Edge, rung: NameRung, design: Box): [number, number][] => {
  const { band, prompt } = rung;
  switch (edge) {
    case "top":
      return [[band.corner + PAD, design.width - band.corner - PAD]];
    case "left":
    case "right":
      return [[band.top + PAD, design.height - band.bottom - PAD]];
    case "bottom":
      // Right-hand flank first: the walk reaches the bottom edge from the right.
      return [
        [(design.width + prompt) / 2 + PAD, design.width - PAD],
        [PAD, (design.width - prompt) / 2 - PAD],
      ];
  }
};

/** `n` centres inside one span, each `label` long: one in the middle, two flush
 * to the ends, more shared out evenly between those. */
const centresIn = ([from, to]: [number, number], n: number, label: number): number[] => {
  if (n <= 0) return [];
  if (n === 1) return [(from + to) / 2];
  const first = from + label / 2;
  const step = (to - label / 2 - first) / (n - 1);
  return Array.from({ length: n }, (_, index) => first + index * step);
};

/**
 * Where the names on one edge sit, **in the order the table plays**. Clockwise
 * from the top-left, which means top and right run with `along` and bottom and
 * left run against it — in raw `along` order seats 3 and 4 sat the wrong way
 * round on a table of six, and since #164 that threw a drawn card to the wrong
 * corner too (#186). Generated in play order here rather than reversed by the
 * caller afterwards.
 */
const alongEdge = (edge: Edge, n: number, rung: NameRung, design: Box): number[] => {
  const length = edge === "top" || edge === "bottom" ? design.width : design.height;
  const spans = spansOf(edge, rung, design);
  // `along` rises left-to-right and top-to-bottom, which is play's direction on
  // the top and right edges and against it on the other two.
  const backwards = edge === "bottom" || edge === "left";

  const places: number[] = [];
  // One span for three of the edges; the bottom's two are already listed in play
  // order, right flank first, and a lone name takes the middle of the one it is in.
  let owed = n;
  for (const [index, span] of spans.entries()) {
    const share = Math.ceil(owed / (spans.length - index));
    const inside = centresIn(span, share, rung.label);
    places.push(...(backwards ? inside.toReversed() : inside));
    owed -= share;
  }
  return places.map((at) => (at / length) * 100);
};

export const seatPoint = (spot: EdgeSeat, design: Box): Point => {
  switch (spot.edge) {
    case "top":
      return { x: (spot.along / 100) * design.width, y: spot.across };
    case "bottom":
      return { x: (spot.along / 100) * design.width, y: design.height - spot.across };
    case "left":
      return { x: spot.across, y: (spot.along / 100) * design.height };
    case "right":
      return { x: design.width - spot.across, y: (spot.along / 100) * design.height };
  }
};

export const edgeSeats = (count: number, design: Box = TABLE_DESIGN): EdgeSeat[] => {
  const rung = nameRung(count);
  const edges = Array.from({ length: Math.max(count, 0) }, (_, index) => edgeFor(index, count));
  const filled = new Map<Edge, number>();

  return edges.map((edge) => {
    const places = alongEdge(edge, seatsOn(edge, count), rung, design);
    const slot = filled.get(edge) ?? 0;
    filled.set(edge, slot + 1);
    return { edge, along: places[slot] ?? 50, across: rung.across[edge] };
  });
};

/**
 * Which seat a point on the board is nearest (#201).
 *
 * A name dragged to an edge is a seat moved in the order, and the honest way to
 * say which place it landed in is *whose spot did it come down on*. Measured
 * against the same `seatPoint` the names and the flights already aim at, so
 * there is one idea of where a seat is rather than three.
 *
 * Never -1: dropping outside the board is dropping on the nearest edge, which is
 * the same answer `moveSeat` gives for a hop off either end.
 */
export const nearestSeat = (point: Point, count: number, design: Box): number => {
  const spots = edgeSeats(count, design);
  let best = 0;
  let closest = Infinity;
  for (const [index, spot] of spots.entries()) {
    const at = seatPoint(spot, design);
    const distance = (at.x - point.x) ** 2 + (at.y - point.y) ** 2;
    if (distance < closest) {
      closest = distance;
      best = index;
    }
  }
  return best;
};
