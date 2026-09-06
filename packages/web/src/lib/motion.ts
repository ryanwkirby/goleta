/**
 * The one thing anything outside the motion layer may ask it. It sits in `lib`
 * rather than `motion` because the flight layer draws real `PlayingCard`s, so
 * `motion` genuinely depends on `components` (#224). The default is a working
 * no-op rather than a throw, so anything rendered outside a provider draws the
 * settled state — which is what the shared table screen wants.
 */

import { createContext, useContext, type RefCallback } from "react";

import type { Card } from "@goleta/engine";

import type { AnchorKey } from "./anchors.ts";

export interface MotionApi {
  anchor: (key: AnchorKey) => RefCallback<HTMLElement>;
  isArriving: (cardId: string) => boolean;
  /** The state's own top card once everything has landed; the previous one, or
   * nothing at all, while a card is inbound. */
  pileFace: (actual: Card) => Card | null;
  /** The one piece of "this layer is busy" anything else may read, and about the
   * deal rather than motion in general: exactly one prompt has to wait on it,
   * because Dealer's Choice opens in `phase: "suit"` before the upcard has
   * landed (#75). */
  dealing: boolean;
  reduced: boolean;
}

const noopRef: RefCallback<HTMLElement> = () => () => {};

/**
 * The settled state, and what anything rendered outside a provider is answered
 * with.
 *
 * Exported because the shared table screen builds its own from it (#449): that
 * board has no DOM anchors and nothing arriving into a hand, but its flight layer
 * does hold the pile back, so it overrides the one member it has an answer for
 * and takes the rest from here rather than restating them.
 */
export const NO_MOTION: MotionApi = {
  anchor: () => noopRef,
  isArriving: () => false,
  pileFace: (actual) => actual,
  dealing: false,
  reduced: true,
};

export const MotionContext = createContext<MotionApi>(NO_MOTION);

export const useMotion = (): MotionApi => useContext(MotionContext);
