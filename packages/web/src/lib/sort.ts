/**
 * Arranging your own hand. Cosmetic and yours alone — no other player's hand is
 * ever sorted for you, since grouping somebody else's cards by suit would hand
 * you their missed plays for free.
 */

import { RANKS, SUITS, type Card } from "@goleta/engine";

export type HandSort = "dealt" | "rank" | "suit";

/** Tapping cycles: as they came, by rank, by suit, back to as they came. */
export const NEXT_SORT: Record<HandSort, HandSort> = {
  dealt: "rank",
  rank: "suit",
  suit: "dealt",
};

export const SORT_LABELS: Record<HandSort, string> = {
  dealt: "as dealt",
  rank: "by rank",
  suit: "by suit",
};

const rankOrder = (card: Card): number => RANKS.indexOf(card.rank);
const suitOrder = (card: Card): number => SUITS.indexOf(card.suit);

/** `dealt` is the order the cards actually reached you, oldest first. */
export const sortHand = (cards: readonly Card[], sort: HandSort): Card[] => {
  switch (sort) {
    case "dealt":
      return [...cards];
    case "rank":
      // Suit only breaks ties, so two fives always land in the same order.
      return cards.toSorted((a, b) => rankOrder(a) - rankOrder(b) || suitOrder(a) - suitOrder(b));
    case "suit":
      return cards.toSorted((a, b) => suitOrder(a) - suitOrder(b) || rankOrder(a) - rankOrder(b));
  }
};
