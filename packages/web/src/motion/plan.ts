/**
 * Turns a batch of events into the card flights that describe them.
 *
 * Pure on purpose: it decides *what* moves where and in what order, never how it
 * is drawn. The engine emits no per-card deal event and shouldn't — a deal is
 * not a rule — so `gameStarted` is expanded here from the hands the state
 * already carries.
 */

import type { Card, GameEvent, GameView, PlayerId } from "@goleta/engine";

import { PEEL_MS, RESHUFFLE_MS } from "../lib/beats.ts";
import type { CardSize } from "../lib/cardShape.ts";
import { cardAnchor, DECK, HAND, PILE, seatAnchor, type AnchorKey } from "../lib/anchors.ts";

export const FLIGHT_MS = 220;
const DEAL_MS = 190;

/** Gap between one card's flight and the next in the same batch. */
const BEAT_MS = 110;
const TURN_UP_BEAT_MS = 95;
/** A held pause either side of a Sunny rewind, so it reads as its own moment. */
const CALL_BEAT_MS = 260;
/** Cards fan out of the deck this fast, squeezed to fit `DEAL_WINDOW_MS`. */
const DEAL_BEAT_MS = 38;
const DEAL_WINDOW_MS = 820;
/** A burst that would run longer than this is compressed rather than queued. */
const BATCH_CAP_MS = 900;


/**
 * The pile going back into the deck, slowly enough to watch. The last card lands
 * around 3.7s into a 4.8s beat, leaving a held second for the words to be read.
 *
 * Every one of them is face down and must stay that way: the recycled pile is
 * shuffled and its order *is* deck order, which `redact.ts` guards.
 */
export const RESHUFFLE_CARDS = 9;
export const RESHUFFLE_BEAT_MS = 380;
const RESHUFFLE_FLIGHT_MS = 620;

export interface FlightPlan {
  id: string;
  /** Null flies face down — a deal, which nobody watches card by card. */
  card: Card | null;
  /** Candidate origins, most specific first. */
  from: AnchorKey[];
  to: AnchorKey[];
  /** Rendered at the destination's size — that's where it comes to rest. */
  size: CardSize;
  /** The size it leaves at, so it grows or shrinks over the trip. */
  fromSize: CardSize;
  delay: number;
  duration: number;
  /** A card kept invisible in the hand it is joining until this lands. */
  hides: string | null;
  /** Landing here hands the pile a new face to show. */
  toPile: boolean;
}

export interface Planned {
  flights: FlightPlan[];
  /** The pile is empty until the upcard lands, so it must stop drawing a card. */
  emptiesPile: boolean;
  /**
   * These flights are a deal going out, so the table is still setting itself up.
   * Reported because one prompt has to wait for it: under Dealer's Choice the
   * game opens in `phase: "suit"` and the dealer was asked to name one while the
   * cards were still in the air (#75).
   */
  deals: boolean;
}

/**
 * How big the cards are where they come to rest, which is not the same on every
 * screen. A flight is drawn at its destination's size and scaled from its
 * origin's, so these are the difference between a card that lands and one that
 * lands and then pops.
 */
export interface TableScale {
  /** Your own cards. */
  hand: CardSize;
  /** The draw pile and the card in play — one size, they sit side by side. */
  pile: CardSize;
  /** Somebody else's hand in the seat strip. */
  seat: CardSize;
}

/** The whole table on one screen: your hand under a strip of everyone else's. */
export const FULL_TABLE: TableScale = { hand: "md", pile: "lg", seat: "sm" };

/**
 * A phone in landscape (#78): your hand takes the screen and the piles shrink
 * into the peek strip. No seats are drawn, so `seat` is only what a flight to
 * one *would* have been — those find no anchor and are dropped.
 *
 * `hand` is the size the row settles on when it has the height, which is every
 * landscape phone. On a shorter box a card in flight lands one size large,
 * which is not worth threading a measurement through the motion layer for.
 */
export const PEEK_TABLE: TableScale = { hand: "2xl", pile: "sm", seat: "sm" };

const isYou = (game: GameView, playerId: PlayerId): boolean => game.you === playerId;

/** Where a player's cards live on screen. */
const handOf = (game: GameView, playerId: PlayerId): AnchorKey =>
  isYou(game, playerId) ? HAND : seatAnchor(playerId);

/** A card in a hand if it's drawn there, otherwise the hand as a whole. */
const cardOrHand = (game: GameView, playerId: PlayerId, cardId: string | null): AnchorKey[] =>
  cardId === null ? [handOf(game, playerId)] : [cardAnchor(cardId), handOf(game, playerId)];

const sizeOfHand = (game: GameView, playerId: PlayerId, scale: TableScale): CardSize =>
  isYou(game, playerId) ? scale.hand : scale.seat;

export const planFlights = (
  events: readonly GameEvent[],
  game: GameView,
  nextId: () => string,
  scale: TableScale = FULL_TABLE,
): Planned => {
  const flights: FlightPlan[] = [];
  let emptiesPile = false;
  let deals = false;
  /**
   * Where the compressible part of this batch begins. The peel and the reshuffle
   * are deliberate holds and may not be squeezed to fit `BATCH_CAP_MS` — that
   * cap exists to stop the table narrating a queue of bot moves it has already
   * left behind, which is the opposite problem. See `compress`.
   */
  let floor = 0;
  // Events in a batch happened in order and should read that way.
  let cursor = 0;

  const add = (plan: Omit<FlightPlan, "id" | "delay"> & { delay?: number }): void => {
    flights.push({ id: nextId(), delay: plan.delay ?? cursor, ...plan });
  };

  for (const event of events) {
    switch (event.type) {
      case "gameStarted": {
        emptiesPile = true;
        deals = true;
        cursor = dealFlights(event.upcard, game, nextId, cursor, flights, scale);
        break;
      }

      case "played": {
        add({
          card: event.card,
          from: isYou(game, event.playerId)
            ? [cardAnchor(event.card.id), HAND]
            : [cardAnchor(event.card.id), seatAnchor(event.playerId)],
          to: [PILE],
          size: scale.pile,
          fromSize: sizeOfHand(game, event.playerId, scale),
          duration: FLIGHT_MS,
          hides: null,
          toPile: true,
        });
        cursor += BEAT_MS;
        break;
      }

      case "drew": {
        add({
          card: event.card,
          from: [DECK],
          to: cardOrHand(game, event.playerId, event.card.id),
          size: sizeOfHand(game, event.playerId, scale),
          fromSize: scale.pile,
          duration: FLIGHT_MS,
          hides: event.card.id,
          toPile: false,
        });
        cursor += BEAT_MS;
        break;
      }

      case "turnedUp": {
        for (const card of event.cards) {
          add({
            card,
            from: [DECK],
            to: [PILE],
            size: scale.pile,
            fromSize: scale.pile,
            duration: FLIGHT_MS,
            hides: null,
            toPile: true,
          });
          cursor += TURN_UP_BEAT_MS;
        }
        break;
      }

      case "surrendered": {
        // The punishment card is played face up like any other card: there is no
        // longer any way for a card to leave a hand and not land on the pile.
        add({
          card: event.card,
          from: isYou(game, event.playerId)
            ? [cardAnchor(event.card.id), HAND]
            : [cardAnchor(event.card.id), seatAnchor(event.playerId)],
          to: [PILE],
          size: scale.pile,
          fromSize: sizeOfHand(game, event.playerId, scale),
          duration: FLIGHT_MS,
          hides: null,
          toPile: true,
        });
        cursor += BEAT_MS;
        break;
      }

      /**
       * The deck running out, given a beat of its own (#209). The flights are the
       * smaller half of it — what makes it readable is that **nothing else in
       * the batch moves until it is over**, so `cursor` jumps the full
       * `RESHUFFLE_MS` and the card turned up afterwards lands on the far side
       * of the hold rather than chasing the last card back into the deck.
       *
       * That is also why `held` is set: `compress` must not squeeze a pause
       * somebody is meant to sit through. The peel gets that for free by being
       * first in its batch; a recycle is in the middle of one.
       */
      case "reshuffled": {
        const start = cursor;
        for (let index = 0; index < RESHUFFLE_CARDS; index += 1) {
          add({
            card: null,
            from: [PILE],
            to: [DECK],
            size: scale.pile,
            fromSize: scale.pile,
            delay: start + index * RESHUFFLE_BEAT_MS,
            duration: RESHUFFLE_FLIGHT_MS,
            hides: null,
            toPile: false,
          });
        }
        cursor = start + RESHUFFLE_MS;
        floor = cursor;
        break;
      }

      /**
       * The rewind, which is the only part of a landed call the table can't read
       * off the cards afterwards: the punishment only makes sense if you watched
       * the game step backwards first (#66).
       *
       * The peel runs first and nothing may move underneath it, so the whole
       * sequence starts on the far side of it. A beat opens the rewind so the
       * ruling lands before the cards move, and another closes it so the forced
       * play doesn't tread on it. A call that missed moves nothing but peels
       * just the same.
       */
      case "sunnyCalled": {
        cursor += PEEL_MS;
        floor = cursor;
        if (event.returned.length === 0) break;
        cursor += CALL_BEAT_MS;
        for (const card of event.returned) {
          add({
            card,
            // The rewind has already taken it out of the hand, so the card's own
            // anchor is gone and the hand as a whole is the origin.
            from: [cardAnchor(card.id), handOf(game, event.targetId)],
            to: [DECK],
            size: scale.pile,
            fromSize: sizeOfHand(game, event.targetId, scale),
            duration: FLIGHT_MS,
            hides: null,
            toPile: false,
          });
          cursor += BEAT_MS;
        }
        cursor += CALL_BEAT_MS;
        break;
      }

      // Nothing moves for these; the log and the seats already say it.
      case "suitChosen":
      case "eliminated":
      case "turnChanged":
      case "gameOver":
        break;
    }
  }

  return { flights: compress(flights, floor), emptiesPile, deals };
};

/** A deal, invented from the dealt hands: round-robin, one card at a time, every
 * card face down including yours. Yours turn over as they land. */
const dealFlights = (
  upcard: Card,
  game: GameView,
  nextId: () => string,
  start: number,
  out: FlightPlan[],
  scale: TableScale,
): number => {
  const rounds = Math.max(0, ...game.players.map((player) => player.cardCount));
  const total = game.players.reduce((sum, player) => sum + player.cardCount, 0) + 1;
  const beat = Math.min(DEAL_BEAT_MS, DEAL_WINDOW_MS / Math.max(total, 1));
  let cursor = start;

  for (let round = 0; round < rounds; round += 1) {
    for (const player of game.players) {
      if (player.cardCount <= round) continue;
      const card = player.hand[round] ?? null;
      out.push({
        id: nextId(),
        card: null,
        from: [DECK],
        to: cardOrHand(game, player.id, card?.id ?? null),
        size: sizeOfHand(game, player.id, scale),
        fromSize: scale.pile,
        delay: cursor,
        duration: DEAL_MS,
        hides: card?.id ?? null,
        toPile: false,
      });
      cursor += beat;
    }
  }

  out.push({
    id: nextId(),
    card: upcard,
    from: [DECK],
    to: [PILE],
    size: scale.pile,
    fromSize: scale.pile,
    delay: cursor,
    duration: FLIGHT_MS,
    hides: null,
    toPile: true,
  });

  return cursor + BEAT_MS;
};

/**
 * Keep a burst inside its window. Bots move on a timer and a resolved call can
 * land half a dozen events at once, so rather than narrate a queue it has
 * already left behind, the table squeezes the delays.
 *
 * The cap is on how long the burst takes, not how long the table waits before
 * it starts. `floor` is where the waiting ends — the cursor past the last
 * deliberate hold. It used to be `Math.min(...delays)`, which worked only
 * because the peel opens its batch; a recycle lands in the *middle* of one, so
 * measuring from the earliest flight squeezed five seconds into 900ms (#209).
 */
const compress = (flights: FlightPlan[], floor: number): FlightPlan[] => {
  if (flights.length === 0) return flights;
  const burst = flights.filter((flight) => flight.delay >= floor);
  if (burst.length === 0) return flights;
  const span = Math.max(...burst.map((flight) => flight.delay)) - floor;
  if (span <= BATCH_CAP_MS) return flights;
  const factor = BATCH_CAP_MS / span;
  return flights.map((flight) =>
    flight.delay < floor
      ? flight
      : { ...flight, delay: floor + Math.round((flight.delay - floor) * factor) },
  );
};

/** When the last card in a batch comes to rest. */
export const settlesAt = (flights: readonly FlightPlan[]): number =>
  Math.max(0, ...flights.map((flight) => flight.delay + flight.duration));
