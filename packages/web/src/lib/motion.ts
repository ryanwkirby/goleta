/**
 * The one thing anything outside the motion layer may ask it: whether a card is
 * mid-flight, what the pile should draw while one is inbound, and an element the
 * flight layer can aim at.
 *
 * It sits in `lib` rather than `motion` because the flight layer draws real
 * `PlayingCard`s, so `motion` genuinely depends on `components` — while the
 * components needed nothing from it but this hook (#224). The default is a
 * working no-op rather than a throw, so anything rendered outside a provider
 * draws the settled state, which is what the shared table screen wants.
 */

import { createContext, useContext, type RefCallback } from "react";

import type { Card } from "@goleta/engine";

import type { AnchorKey } from "./anchors.ts";

export interface MotionApi {
  /** Registers an element as somewhere a card can fly to or from. */
  anchor: (key: AnchorKey) => RefCallback<HTMLElement>;
  /** True while this card is still in the air on its way to a hand. */
  isArriving: (cardId: string) => boolean;
  /** The state's own top card once everything has landed; the previous one, or
   * nothing at all, while a card is inbound. */
  pileFace: (actual: Card) => Card | null;
  /**
   * The one piece of "this layer is busy" anything else may read, and it is about
   * the deal rather than motion in general: exactly one prompt has to wait on it,
   * because Dealer's Choice opens in `phase: "suit"` before the upcard has landed
   * (#75). False under reduced motion — nothing is planned, so nothing to wait on.
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
