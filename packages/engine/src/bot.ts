/**
 * A bot that plays by the rules.
 *
 * It decides from a `GameView` — the same redacted picture a human gets — not
 * from the authoritative state. That keeps it honest with hands down, and it
 * doubles as a standing check that the view carries enough to actually play.
 */

import { randomInt } from "./rng.ts";
import { isWild } from "./cards.ts";
import type { GameView } from "./redact.ts";
import { SUITS, type Card, type Intent, type PlayerId, type Suit } from "./types.ts";

/**
 * How often a table of bots calls a violation it has caught.
 *
 * One roll per violation, taken by the table as a whole rather than by each bot
 * in turn — see `rollSunnyCall`. Seven bots are therefore exactly as watchful as
 * one, and you get away with roughly three illegal draws in ten either way,
 * which is about what a room of people manages.
 */
export const SUNNY_CALL_CHANCE = 70;

/**
 * The table's single decision about the violation standing right now: call it,
 * or let it go.
 *
 * The caller rolls once, when the violation first exists, and hands every bot
 * the same answer. Rolling per bot would make a full table nearly impossible to
 * slip anything past; re-rolling as the window ticks along would walk the odds
 * up to certainty on its own.
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
 * Which card to play when you have no choice about playing.
 *
 * Wilds go first: an 8 in hand is what stops you drawing, so getting rid of it
 * buys back the ability to be stuck. Otherwise shed from the suit you hold
 * least of, since whatever you play sets the suit you'll face next turn.
 */
const pickPlay = (view: GameView): Card | undefined => {
  const legal = ownHand(view).filter((card) => view.legalCardIds.includes(card.id));
  const wild = legal.find(isWild);
  if (wild) return wild;

  const counts = countBySuit(ownHand(view));
  return legal.toSorted((a, b) => (counts[a.suit] ?? 0) - (counts[b.suit] ?? 0))[0];
};

/** Name the suit you hold least of, so you're least likely to be forced again. */
const pickSuit = (view: GameView): Suit => {
  const counts = countBySuit(ownHand(view));
  return SUITS.toSorted((a, b) => counts[a] - counts[b])[0] as Suit;
};

/**
 * Which card to give up, whether as a punishment or for a bad call.
 *
 * Legality doesn't come into it — a surrendered card needn't match anything,
 * and by the time a punishment is owed the skipped play has already been made,
 * so there is nothing left to dodge. That leaves the plain question of which
 * card you least want: the 8, which is what stops you being stuck at all, and
 * otherwise one from the suit you hold most of.
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
 * The bot's move, if it has one.
 *
 * Nothing here is random. Every choice falls out of the view it was handed, and
 * the one coin-flip a bot ever needed — whether to speak up about a violation —
 * belongs to the table rather than to any one seat, so it is rolled outside and
 * passed in.
 */
export const decideBotIntent = (view: GameView, { callSunny = false }: BotOptions = {}): Intent | null => {
  const me: PlayerId | null = view.you;
  if (me === null || view.status === "over") return null;

  // A bot accuses only somebody it has actually caught. `sunnyWouldLand` is the
  // same tell a human reads off the sun's glow, so this gates behaviour on
  // information the bot already holds rather than handing it any more — and a
  // call that misses costs a card, which is not a price to pay on a guess.
  if (callSunny && view.sunnyCallable && view.sunnyWouldLand) {
    return { type: "callSunny", playerId: me };
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
    // No legal card, so drawing is both allowed and required.
    if (view.phase.kind === "action") return { type: "drawCard", playerId: me };
  }

  return null;
};
