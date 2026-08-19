/**
 * The one thing anything outside the motion layer may ask it.
 *
 * A card component has to know whether it is mid-flight, the pile has to know
 * what to draw while a card is still on its way to it, and every one of them
 * has to hand back an element the flight layer can aim at. That is this
 * context, and it is the whole of the public surface.
 *
 * It sits in `lib` rather than in `motion` because the traffic runs both ways
 * and only one direction is real: the flight layer draws actual `PlayingCard`s
 * and `CardBack`s, so `motion` genuinely depends on `components` — while four
 * components needed nothing from `motion` but this hook and the anchor names
 * beside it. Splitting the context out is what turns a cycle into an ordinary
 * dependency (#224); `TableMotion.tsx` imports `MotionContext` back to provide
 * it, which is the direction that was never in doubt.
 *
 * The default is a working no-op rather than a thrown error, deliberately.
 * `reduced: true` and `pileFace` returning the card it was given mean anything
 * rendered outside a provider draws the settled state — which is what the
 * shared table screen does on purpose, and what every future caller that
 * forgets should do too.
 */

import { createContext, useContext, type RefCallback } from "react";

import type { Card } from "@goleta/engine";

import type { AnchorKey } from "./anchors.ts";

export interface MotionApi {
  /** Registers an element as somewhere a card can fly to or from. */
  anchor: (key: AnchorKey) => RefCallback<HTMLElement>;
  /** True while this card is still in the air on its way to a hand. */
  isArriving: (cardId: string) => boolean;
  /**
   * What the pile should show. The state's own top card once everything has
   * landed; the previous one, or nothing at all, while a card is inbound.
   */
  pileFace: (actual: Card) => Card | null;
  /**
   * True while the cards are still going out.
   *
   * The one piece of "this layer is busy" anything else may read, and it is
   * about the deal rather than motion in general on purpose. Exactly one prompt
   * has to wait on it: under Dealer's Choice the game opens in `phase: "suit"`,
   * so the dealer was asked to name a suit for an 8 that had not landed on a
   * pile that was not there yet (#75). Every other prompt describes a state
   * somebody can act on, and a card in the air is no reason to hold one back.
   *
   * False under reduced motion — nothing is planned, so there is nothing to wait
   * for and no artificial wait to invent.
   */
  dealing: boolean;
  /** Motion is off. Anything that moves should skip straight to the result. */
  reduced: boolean;
}

const noopRef: RefCallback<HTMLElement> = () => () => {};

export const MotionContext = createContext<MotionApi>({
  anchor: () => noopRef,
  isArriving: () => false,
  pileFace: (actual) => actual,
  dealing: false,
  reduced: true,
});

export const useMotion = (): MotionApi => useContext(MotionContext);
