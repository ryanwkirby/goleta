/**
 * What the pile draws while a card is still on its way to it (#449).
 *
 * Every state message arrives as a finished picture, so the card in play changes
 * the instant it is played — and a flight layer then spends the better part of a
 * second flying that same card to the place it is already drawn. The answer is
 * that the pile lags the state: while cards are inbound it keeps showing the card
 * they are landing *on*, and only once nothing is in the air does it go back to
 * reading `game.topCard`.
 *
 * **It is a rule about what the pile draws, so it lives here rather than in
 * either flight layer.** There are two of them — `motion/TableMotion.tsx` for the
 * phones and `TableFlights` inside the shared screen (#200) — and they agree on
 * nothing else: one lands a card on an animation's `finish` event against a DOM
 * rect, the other on a timer against design coordinates. What they must agree on
 * is this, and it was written in exactly one of them until #449.
 *
 * The hold is **presentation and nothing else**: no event, no field on the wire,
 * nothing gated on it. The deck stays tappable throughout, exactly as it does
 * under a peel and a reshuffle.
 */

import type { Card } from "@goleta/engine";

/** `actual` is the state's own top card — what the pile draws when nothing is in
 * the air. `empty` is the dashed outline, which is a real answer: a deal's
 * upcard is the last card out, so there is nothing on the pile until it lands. */
export type PileFace = { kind: "actual" } | { kind: "card"; card: Card } | { kind: "empty" };

export interface PileHold {
  /** Cards still in the air on their way to the pile. */
  inbound: number;
  face: PileFace;
}

/** Nothing in the air: the pile is the state's, which is where it spends most of
 * its life. */
export const SETTLED: PileHold = { inbound: 0, face: { kind: "actual" } };

/**
 * `count` cards have set off for the pile, from a board whose top card was
 * `before`. `empties` is the deal, which is the one batch that leaves the pile
 * with nothing on it at all.
 *
 * The face is taken from the batch rather than from whatever is being held, so a
 * second burst arriving mid-flight moves the pile on rather than stalling it at
 * a card two plays old — the count is what keeps the hold running until the last
 * of them has landed.
 */
export const setOff = (
  hold: PileHold,
  count: number,
  before: Card | null,
  empties: boolean,
): PileHold => ({
  inbound: hold.inbound + count,
  face: empties || !before ? { kind: "empty" } : { kind: "card", card: before },
});

/**
 * One of them has arrived, carrying `card`.
 *
 * The last card in is the one the state already calls the top card, so once
 * nothing is inbound the pile goes back to reading the state rather than holding
 * a copy of it — which is also what makes a batch that is somehow never
 * completed recoverable by the next one.
 */
export const landed = (hold: PileHold, card: Card | null): PileHold => {
  const inbound = Math.max(0, hold.inbound - 1);
  return {
    inbound,
    face: inbound > 0 && card ? { kind: "card", card } : { kind: "actual" },
  };
};

/** The card to draw, given the one the state says is up. Null draws the outline. */
export const faceOf = (hold: PileHold, actual: Card): Card | null => {
  if (hold.face.kind === "empty") return null;
  return hold.face.kind === "card" ? hold.face.card : actual;
};
