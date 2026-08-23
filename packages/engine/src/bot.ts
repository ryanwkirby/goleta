/**
 * A bot that plays by the rules, deciding from a `GameView` — the same redacted
 * picture a human gets, which keeps it honest and checks the view carries enough
 * to play. It reads the seat ahead of it, which is neither cheating nor a leak:
 * every hand is face up, and it works legality out from `isPlayable` itself.
 */

import { randomInt } from "./rng.ts";
import { isPlayable, isWild } from "./cards.ts";
import type { GameView, PlayerView } from "./redact.ts";
import {
  SUITS,
  type Card,
  type Intent,
  type PlayerId,
  type SunnyReach,
  type Suit,
} from "./types.ts";

/**
 * How often a table of bots calls a violation it has caught. One roll per
 * violation, taken by the table as a whole, so seven bots are exactly as
 * watchful as one.
 */
export const SUNNY_CALL_CHANCE = 70;

/**
 * Rolled once, when the violation first exists, and handed to every bot. Per bot
 * would make a full table impossible to slip anything past; re-rolling as the
 * window ticks would walk the odds up to certainty.
 */
export const rollSunnyCall = (seed: number): [call: boolean, seed: number] => {
  const [roll, next] = randomInt(seed, 100);
  return [roll < SUNNY_CALL_CHANCE, next];
};

export interface BotOptions {
  /** The table's verdict from `rollSunnyCall`, the same for every bot. */
  callSunny?: boolean;
}

const ownHand = (view: GameView): Card[] =>
  view.players.find((p) => p.id === view.you)?.hand ?? [];

const countBySuit = (hand: readonly Card[]): Record<Suit, number> => {
  const counts: Record<Suit, number> = { C: 0, D: 0, H: 0, S: 0 };
  for (const card of hand) counts[card.suit] += 1;
  return counts;
};

/**
 * The next seat still in the game, walking from `turnPlayerId` rather than `you`
 * — during a suit call the two differ. Naming always advances the turn, so this
 * one walk answers "who has to match this?" under every variant.
 */
const nextPlayer = (view: GameView): PlayerView | undefined => {
  const seats = view.players;
  const from = seats.findIndex((p) => p.id === view.turnPlayerId);
  if (from < 0) return undefined;
  for (let step = 1; step <= seats.length; step++) {
    const candidate = seats[(from + step) % seats.length];
    if (candidate && !candidate.eliminated) return candidate;
  }
  return undefined;
};

const canAnswer = (hand: readonly Card[], card: Card): boolean =>
  hand.some((held) => isPlayable(held, card.suit, card.rank));

/**
 * Wilds go first: an 8 in hand is what stops you drawing. Otherwise look one seat
 * along and prefer a card that seat can answer — the opposite of the intuition,
 * and the whole game, since playing is compulsory. The tiebreak is to shed from
 * the suit you hold least of. One seat and one question is the ceiling (#107).
 */
const pickPlay = (view: GameView): Card | undefined => {
  const legal = ownHand(view).filter((card) => view.legalCardIds.includes(card.id));
  const wild = legal.find(isWild);
  if (wild) return wild;

  const counts = countBySuit(ownHand(view));
  // Only in the ordinary run of play: the card owed for a landed call is buried
  // immediately, so what the next player faces isn't this choice to make.
  const ahead = view.phase.kind === "action" ? nextPlayer(view) : undefined;
  const cornering = ahead ? legal.filter((card) => canAnswer(ahead.hand, card)) : [];
  const from = cornering.length > 0 ? cornering : legal;
  return from.toSorted((a, b) => (counts[a.suit] ?? 0) - (counts[b.suit] ?? 0))[0];
};

/**
 * Which suit to name, having just laid an 8. Same reading as `pickPlay`, ties
 * falling to the suit you hold least of.
 *
 * Under Power of Eights the namer is the player who then follows it, so
 * `nextPlayer` is the bot itself and the reading rule would have it name against
 * its own hand. That case keeps the old behaviour outright.
 */
const pickSuit = (view: GameView): Suit => {
  const counts = countBySuit(ownHand(view));
  const mine = SUITS.toSorted((a, b) => counts[a] - counts[b]) as Suit[];

  const answering = nextPlayer(view);
  if (!answering || answering.id === view.you) return mine[0] as Suit;

  const theirs = countBySuit(answering.hand);
  return mine.find((suit) => theirs[suit] > 0) ?? (mine[0] as Suit);
};

/**
 * The punishment card. Legality doesn't come into it and the skipped play has
 * already been made, so it is the plain question of which card you least want:
 * the 8, then one from the suit you hold most of.
 */
const pickSurrender = (view: GameView): Card | undefined => {
  const hand = ownHand(view);
  if (hand.length === 0) return undefined;

  const wild = hand.find(isWild);
  if (wild) return wild;

  const counts = countBySuit(hand);
  return hand.toSorted((a, b) => (counts[b.suit] ?? 0) - (counts[a.suit] ?? 0))[0];
};

/**
 * Which card to name, if the offender's pre-draw hand holds one that was legal.
 * Worked out from `reach` the same way a human has to — nothing says which card
 * was legal.
 */
const pickAccusation = (reach: SunnyReach): Card | undefined => {
  const legal = reach.hand.filter((card) => isPlayable(card, reach.activeSuit, reach.topRank));
  const wild = legal.find(isWild);
  if (wild) return wild;

  const counts = countBySuit(reach.hand);
  return legal.toSorted((a, b) => (counts[a.suit] ?? 0) - (counts[b.suit] ?? 0))[0];
};

/**
 * The bot's move, if it has one. Nothing here is random: the one coin-flip a bot
 * needs belongs to the table rather than the seat, so it is rolled outside and
 * passed in.
 */
export const decideBotIntent = (view: GameView, { callSunny = false }: BotOptions = {}): Intent | null => {
  const me: PlayerId | null = view.you;
  if (me === null || view.status === "over") return null;

  // Only somebody it has actually caught, and only when not locked out. A call it
  // can't back with a legal card is one it never makes.
  if (callSunny && view.sunnyCallable && view.sunnyLockedReaches === 0 && view.sunnyReach) {
    const card = pickAccusation(view.sunnyReach);
    if (card) return { type: "callSunny", playerId: me, cardId: card.id };
  }

  if (view.phase.kind === "surrender") {
    if (view.phase.playerId !== me) return null;
    const card = pickSurrender(view);
    return card ? { type: "surrenderCard", playerId: me, cardId: card.id } : null;
  }

  if (view.waitingOn !== me) return null;

  if (view.phase.kind === "suit") {
    return { type: "chooseSuit", playerId: me, suit: pickSuit(view) };
  }

  if (view.phase.kind === "action" || view.phase.kind === "sunnyPlay") {
    const card = pickPlay(view);
    if (card) return { type: "playCard", playerId: me, cardId: card.id };
    // Genuinely stuck and drawn out, so the turn is over and somebody has to say
    // so (#260). **Only ever when stuck**: a bot pressing it while holding a play
    // would be a bot handed a Sunny violation it never chose, which is the thing
    // the shared screen's bot check already exists to prevent.
    if (view.phase.kind === "action") {
      return view.canEndTurn
        ? { type: "endTurn", playerId: me }
        : { type: "drawCard", playerId: me };
    }
  }

  return null;
};
