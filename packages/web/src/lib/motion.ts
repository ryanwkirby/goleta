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

export const MotionContext = createContext<MotionApi>({
  anchor: () => noopRef,
  isArriving: () => false,
  pileFace: (actual) => actual,
  dealing: false,
  reduced: true,
});

export const useMotion = (): MotionApi => useContext(MotionContext);
