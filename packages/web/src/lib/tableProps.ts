/**
 * The vocabulary both table layouts speak.
 *
 * Four bundles rather than the thirty loose props `HandView` used to take
 * (#225). They live here rather than on either layout because *both* need them
 * — `HandView` takes them and the upright table's own pieces take the same
 * three — and a shared shape that lives inside one of its consumers puts that
 * consumer's folder in a cycle with its own children, which is what happened
 * when these sat in `HandView.tsx` (#231).
 *
 * The grouping is at the boundary and nowhere else: every consumer destructures
 * on its first line, so nothing inside a component reads `table.game` or
 * `hand.cards`.
 */

import type { Card, ClientMessage, GameView, RoomView, ShoutKind } from "@goleta/engine";

import type { GoletaError } from "./feed.ts";
import type { NameOf } from "./format.ts";
import type { HandMode } from "./handMode.ts";
import type { HandSort } from "./sort.ts";

/**
 * The room, and how to talk to it. Everything here is a fact about the table
 * rather than about you.
 */
export interface TableContext {
  room: RoomView;
  game: GameView;
  nameOf: NameOf;
  send: (message: ClientMessage) => void;
  offline: boolean;
  /** Cards to draw, while the deck running out is being watched (#209). */
  reshuffling: number | null;
}

/** Your own cards, and everything you can do with them. */
export interface HandControls {
  /** Your hand, already in whatever order you asked for. */
  cards: Card[];
  mode: HandMode;
  assist: boolean;
  onChooseCard: (cardId: string) => void;
  /** A refused move, shown against the top edge of the hand — same as upright. */
  refusal: GoletaError | null;
  canDraw: boolean;
  onDraw: () => void;
  /** The table is waiting on you. `waitingOn`, not whose turn it is. */
  mine: boolean;
  handSort: HandSort;
  onCycleSort: () => void;
}

/**
 * Asking for a hand, and being seen to. Taking help is public by design (#33),
 * so both directions are in here: what you are asking for, and what somebody
 * else is.
 */
export interface HelpControls {
  stalled: boolean;
  onAskForHelp: () => void;
  /** Your own settings, which in landscape live on the strip (#188). */
  hints: boolean;
  onChooseHints: (on: boolean) => void;
  /** Your own shout, if you have one up, and which of the two kinds it is. */
  shouting: ShoutKind | null;
  /**
   * Somebody else asking for a hand, by name — drawn in the strip, because this
   * view has no seats for it to rise off and a table that can't see the ask is
   * a table where help stopped being public.
   */
  helpFrom: { name: string; kind: ShoutKind } | null;
}

/** The Sunny call: the offer, and the accusation being composed against it. */
export interface SunnyControls {
  /** The call being composed, if any — the state lives on `Table`. */
  accusing: string | null;
  stillAccusable: boolean;
  /**
   * Whose reach is on offer, if anybody's. Worked out on `Table`, which is
   * where the picker's own state lives, so the offer and the picker can never
   * be up at the same time.
   */
  target: string | null;
  onStartAccusing: (playerId: string) => void;
  onStopAccusing: () => void;
  onAccuse: (cardId: string) => void;
}

/**
 * Four bundles and two links, rather than the thirty separate props this used
 * to take (#225).
 *
 * Thirty is past the point where a list is easier to read than a grouping, and
 * the call site on `Table` was thirty-five consecutive lines of prop-passing —
 * which a fresh agent adding one boolean to this view reported as "edits in
 * four spots across three files".
 *
 * The bundles are destructured on the first line of the component, so nothing
 * inside it reads `table.game` or `hand.cards`: the grouping is at the boundary
 * where it helps and nowhere else.
 */
