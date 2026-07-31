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

/** How often a bot speaks up when a call is available. It is often wrong. */
export const SUNNY_CALL_CHANCE = 15;

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
 * The bot's move, if it has one. Returns the seed to carry forward so a run of
 * bot games replays exactly.
 */
export const decideBotIntent = (
  view: GameView,
  seed: number,
): [intent: Intent | null, seed: number] => {
  const me: PlayerId | null = view.you;
  if (me === null || view.status === "over") return [null, seed];

  let rng = seed;
  if (view.sunnyCallable) {
    const [roll, next] = randomInt(rng, 100);
    rng = next;
    if (roll < SUNNY_CALL_CHANCE) return [{ type: "callSunny", playerId: me }, rng];
  }

  if (view.phase.kind === "surrender") {
    if (view.phase.playerId !== me) return [null, rng];
    const card = pickSurrender(view);
    return [card ? { type: "surrenderCard", playerId: me, cardId: card.id } : null, rng];
  }

  if (view.waitingOn !== me) return [null, rng];

  if (view.phase.kind === "suit") {
    return [{ type: "chooseSuit", playerId: me, suit: pickSuit(view) }, rng];
  }

  if (view.phase.kind === "action" || view.phase.kind === "sunnyPlay") {
    const card = pickPlay(view);
    if (card) return [{ type: "playCard", playerId: me, cardId: card.id }, rng];
    // No legal card, so drawing is both allowed and required.
    if (view.phase.kind === "action") return [{ type: "drawCard", playerId: me }, rng];
  }

  return [null, rng];
};
