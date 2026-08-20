import { RANKS, SUITS, WILD_RANK, type Card, type Rank, type Suit } from "./types.ts";
import { shuffle } from "./rng.ts";

/** `deckCount` stays a parameter because every physical card gets its own id,
 * so dealing from more than one deck needs nothing downstream to care. */
export const buildDeck = (deckCount: number): Card[] => {
  const cards: Card[] = [];
  for (let copy = 1; copy <= deckCount; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${rank}${suit}#${copy}`, rank, suit });
      }
    }
  }
  return cards;
};

export const shuffleDeck = (cards: readonly Card[], seed: number): [Card[], number] =>
  shuffle(cards, seed);

/**
 * Whether an 8 played *from a hand* is wild. An 8 turned up off the deck is
 * natural, so callers turning a card up must not consult this.
 */
export const isWild = (card: Card): boolean => card.rank === WILD_RANK;

/** `activeSuit` rather than the top card's own suit: after a wild 8 the named
 * suit is what counts. */
export const isPlayable = (card: Card, activeSuit: Suit, topRank: Rank): boolean =>
  isWild(card) || card.suit === activeSuit || card.rank === topRank;

export const cardLabel = (card: Card): string => `${card.rank}${card.suit}`;

export const SUIT_NAMES: Record<Suit, string> = {
  C: "Clubs",
  D: "Diamonds",
  H: "Hearts",
  S: "Spades",
};
