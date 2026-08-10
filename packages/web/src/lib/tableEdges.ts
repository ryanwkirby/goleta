/**
 * Where each seat's name goes on the shared table screen, and which way up.
 *
 * A screen lying in the middle of a table has four edges and somebody sitting
 * at each of them. This works out which edge a seat is on, whereabouts along it
 * the name sits, and how far the name has to be turned to be read *by the
 * person sitting there* — which is the whole point and was, until #141, exactly
 * 180° out on all four sides: the top name was drawn upright, readable from the
 * bottom of the table, and the right-hand name read top-to-bottom, which is
 * what somebody sitting on the *left* sees.
 *
 * Pure arithmetic, no DOM, for the same reason as `fitScale.ts`: what the board
 * does with eight seats is a test rather than eight people and a tablet.
 */

export type Edge = "top" | "right" | "bottom" | "left";

/**
 * Which edge a seat sits at. Seat order is turn order, so this walks the table
 * the way play does — a quarter of the seats to each edge, in order, which is
 * what makes a card flying to a name flying in the direction that player is.
 */
export const edgeFor = (index: number, count: number): Edge => {
  const t = count <= 1 ? 0 : index / count;
  if (t < 0.25) return "top";
  if (t < 0.5) return "right";
  if (t < 0.75) return "bottom";
  return "left";
};

/**
 * How far the name is turned, in degrees, to be read from outside that edge.
 *
 * Bottom is upright — that reader is where the board's own bottom is. Every
 * other edge is a quarter turn away from them in the direction you would walk
 * round the table.
 */
export const TURN_FOR: Record<Edge, number> = { bottom: 0, left: 90, top: 180, right: -90 };

/**
 * The strips round the edge of the design that belong to the names, and that
 * nothing else is drawn into. `TableScreen` insets the board by these; the
 * tests hold the placement below to them.
 *
 * The bottom one is deeper because it is shared with the turn prompt. The two
 * top corners are reserved as well — the room code sits in one and the view
 * toggle in the other, both of them clear of the piles and clear of the peel,
 * which fans well outside the pile it hangs off.
 */
export const BAND = { top: 48, bottom: 72, side: 56, corner: 120 };

/** How long a name is allowed to get before it truncates (`max-w-48`). */
export const LABEL = 192;

export interface EdgeSeat {
  edge: Edge;
  /** Percentage along that edge, measured left-to-right / top-to-bottom. */
  along: number;
}

/**
 * The bottom edge shares its band with the turn prompt, which is centred, so
 * names there are pushed out towards the corners. Everywhere else a lone name
 * sits in the middle of its edge, where that player is.
 *
 * It is a real asymmetry for a real reason rather than an oversight: the prompt
 * has to be somewhere, and every other place for it costs the piles height —
 * which on a phone is the board's *width*, since the whole thing is turned a
 * quarter (see `fitScale.ts`). Better an off-centre name at one edge than two
 * smaller decks at all four.
 */
const BOTTOM_ENDS = { lone: 12, pair: [12, 88] };
/**
 * A pair has to clear both ends of its edge: on the sides that means the top
 * and bottom bands, and along the top it means the room code in one corner and
 * the view toggle in the other. A name is up to `LABEL` long and sits centred
 * on its mark, so the mark has to be half a label clear of whatever is at the
 * end — which on the short sides, where the bands are, leaves less room than it
 * looks. The tests hold both.
 */
const CENTRED = { lone: 50, pair: [30, 70] };

/**
 * Every seat placed, in seat order.
 *
 * Names are laid out per edge rather than by index arithmetic, so two seats on
 * one edge are spread across it and a lone seat is placed on its own terms. The
 * table seats eight at most, so an edge holds one name or two.
 */
export const edgeSeats = (count: number): EdgeSeat[] => {
  const edges = Array.from({ length: Math.max(count, 0) }, (_, index) => edgeFor(index, count));

  const placed: EdgeSeat[] = [];
  for (const [index, edge] of edges.entries()) {
    const onEdge = edges.reduce<number[]>((all, candidate, at) => {
      if (candidate === edge) all.push(at);
      return all;
    }, []);
    const slot = onEdge.indexOf(index);
    const spread = edge === "bottom" ? BOTTOM_ENDS : CENTRED;
    placed.push({
      edge,
      along: onEdge.length <= 1 ? spread.lone : (spread.pair[slot] ?? spread.lone),
    });
  }
  return placed;
};
