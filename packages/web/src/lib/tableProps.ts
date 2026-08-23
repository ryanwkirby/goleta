/**
 * The vocabulary both table layouts speak: four bundles rather than the thirty
 * loose props `HandView` used to take (#225). They live here because *both*
 * layouts need them, and a shared shape inside one of its consumers puts that
 * folder in a cycle with its own children (#231).
 *
 * Every consumer destructures on its first line, so the grouping is at the
 * boundary and nowhere else.
 */

import type {
  Card,
  ClientMessage,
  GameView,
  PlayerId,
  RoomView,
  ShoutKind,
} from "@goleta/engine";

import type { GoletaError } from "./feed.ts";
import type { NameOf } from "./format.ts";
import type { HandMode } from "./handMode.ts";
import type { HandSort } from "./sort.ts";

export interface TableContext {
  room: RoomView;
  game: GameView;
  nameOf: NameOf;
  send: (message: ClientMessage) => void;
  offline: boolean;
  reshuffling: number | null;
  /** Whoever has just left the table, while it is worth saying (#256). */
  departed: PlayerId | null;
}

export interface HandControls {
  cards: Card[];
  mode: HandMode;
  assist: boolean;
  onChooseCard: (cardId: string) => void;
  refusal: GoletaError | null;
  canDraw: boolean;
  onDraw: () => void;
  mine: boolean;
  handSort: HandSort;
  onCycleSort: () => void;
}

/** Taking help is public by design (#33), so both directions are here: what you
 * are asking for, and what somebody else is. */
export interface HelpControls {
  stalled: boolean;
  onAskForHelp: () => void;
  hints: boolean;
  onChooseHints: (on: boolean) => void;
  shouting: ShoutKind | null;
  /** Drawn in the strip, because this view has no seats for it to rise off and a
   * table that can't see the ask is a table where help stopped being public. */
  helpFrom: { name: string; kind: ShoutKind } | null;
}

export interface SunnyControls {
  accusing: string | null;
  stillAccusable: boolean;
  /** Worked out on `Table`, where the picker's state lives, so the offer and the
   * picker can never be up at the same time. */
  target: string | null;
  onStartAccusing: (playerId: string) => void;
  onStopAccusing: () => void;
  onAccuse: (cardId: string) => void;
}

