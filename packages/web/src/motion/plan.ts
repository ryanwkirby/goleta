/**
 * Turns a batch of events into the card flights that describe them.
 *
 * Pure on purpose: it decides *what* moves where and in what order, never how
 * it is drawn. Nothing here touches the DOM, so the sequencing a table sees is
 * covered by tests rather than by squinting at the screen.
 *
 * The engine emits no per-card deal event and shouldn't — a deal is not a rule.
 * `gameStarted` is expanded here, from the hands the state already carries.
 */

import type { Card, GameEvent, GameView, PlayerId } from "@goleta/engine";

import type { CardSize } from "../components/Card.tsx";
import { cardAnchor, DECK, HAND, PILE, seatAnchor, type AnchorKey } from "./anchors.ts";

export const FLIGHT_MS = 220;
const DEAL_MS = 190;
const RESHUFFLE_MS = 260;

/** Gap between one card's flight and the next in the same batch. */
const BEAT_MS = 110;
const TURN_UP_BEAT_MS = 95;
/** Cards fan out of the deck this fast, squeezed to fit `DEAL_WINDOW_MS`. */
const DEAL_BEAT_MS = 38;
const DEAL_WINDOW_MS = 820;
/** A burst that would run longer than this is compressed rather than queued. */
const BATCH_CAP_MS = 900;
/** The pile is a stack; shuffling it back only needs to look like a few cards. */
const RESHUFFLE_CARDS = 3;

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
}

const isYou = (game: GameView, playerId: PlayerId): boolean => game.you === playerId;

/** Where a player's cards live on screen. */
const handOf = (game: GameView, playerId: PlayerId): AnchorKey =>
  isYou(game, playerId) ? HAND : seatAnchor(playerId);

/** A card in a hand if it's drawn there, otherwise the hand as a whole. */
const cardOrHand = (game: GameView, playerId: PlayerId, cardId: string | null): AnchorKey[] =>
  cardId === null ? [handOf(game, playerId)] : [cardAnchor(cardId), handOf(game, playerId)];

const sizeOfHand = (game: GameView, playerId: PlayerId): CardSize =>
  isYou(game, playerId) ? "md" : "sm";

export const planFlights = (
  events: readonly GameEvent[],
  game: GameView,
  nextId: () => string,
): Planned => {
  const flights: FlightPlan[] = [];
  let emptiesPile = false;
  // Events in a batch happened in order and should read that way, so each one
  // starts a beat after the last rather than all at once.
  let cursor = 0;

  const add = (plan: Omit<FlightPlan, "id" | "delay"> & { delay?: number }): void => {
    flights.push({ id: nextId(), delay: plan.delay ?? cursor, ...plan });
  };

  for (const event of events) {
    switch (event.type) {
      case "gameStarted": {
        emptiesPile = true;
        cursor = dealFlights(event.upcard, game, nextId, cursor, flights);
        break;
      }

      case "played": {
        add({
          card: event.card,
          from: isYou(game, event.playerId)
            ? [cardAnchor(event.card.id), HAND]
            : [cardAnchor(event.card.id), seatAnchor(event.playerId)],
          to: [PILE],
          size: "lg",
          fromSize: sizeOfHand(game, event.playerId),
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
          size: sizeOfHand(game, event.playerId),
          fromSize: "lg",
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
            size: "lg",
            fromSize: "lg",
            duration: FLIGHT_MS,
            hides: null,
            toPile: true,
          });
          cursor += TURN_UP_BEAT_MS;
        }
        break;
      }

      case "surrendered": {
        // The punishment card is played face up like any other card. There is
        // no longer any way for a card to leave a hand and *not* land on the
        // pile — the bad-call burial went with the wrong-call forfeit.
        add({
          card: event.card,
          from: isYou(game, event.playerId)
            ? [cardAnchor(event.card.id), HAND]
            : [cardAnchor(event.card.id), seatAnchor(event.playerId)],
          to: [PILE],
          size: "lg",
          fromSize: sizeOfHand(game, event.playerId),
          duration: FLIGHT_MS,
          hides: null,
          toPile: true,
        });
        cursor += BEAT_MS;
        break;
      }

      case "reshuffled": {
        for (let index = 0; index < RESHUFFLE_CARDS; index += 1) {
          add({
            card: null,
            from: [PILE],
            to: [DECK],
            size: "lg",
            fromSize: "lg",
            duration: RESHUFFLE_MS,
            hides: null,
            toPile: false,
          });
          cursor += 60;
        }
        cursor += BEAT_MS;
        break;
      }

      // Nothing moves for these; the log and the seats already say it.
      case "suitChosen":
      case "sunnyCalled":
      case "eliminated":
      case "turnChanged":
      case "gameOver":
        break;
    }
  }

  return { flights: compress(flights), emptiesPile };
};

/**
 * A deal, invented from the dealt hands.
 *
 * Round-robin, one card at a time, the way it would go round a real table —
 * every card face down, including yours. Yours turn over as they land.
 */
const dealFlights = (
  upcard: Card,
  game: GameView,
  nextId: () => string,
  start: number,
  out: FlightPlan[],
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
        size: sizeOfHand(game, player.id),
        fromSize: "lg",
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
    size: "lg",
    fromSize: "lg",
    delay: cursor,
    duration: FLIGHT_MS,
    hides: null,
    toPile: true,
  });

  return cursor + BEAT_MS;
};

/**
 * Keep a burst inside its window.
 *
 * Bots move on a timer, and a resolved Sunny call can land half a dozen events
 * at once. Rather than let the table narrate a queue it has already left
 * behind, squeeze the delays so the whole batch still finishes promptly.
 */
const compress = (flights: FlightPlan[]): FlightPlan[] => {
  const longest = Math.max(0, ...flights.map((flight) => flight.delay));
  if (longest <= BATCH_CAP_MS) return flights;
  const factor = BATCH_CAP_MS / longest;
  return flights.map((flight) => ({ ...flight, delay: Math.round(flight.delay * factor) }));
};

/** When the last card in a batch comes to rest. */
export const settlesAt = (flights: readonly FlightPlan[]): number =>
  Math.max(0, ...flights.map((flight) => flight.delay + flight.duration));
