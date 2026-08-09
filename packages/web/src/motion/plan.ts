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
/** A held pause either side of a Sunny rewind, so it reads as its own moment. */
const CALL_BEAT_MS = 260;
/**
 * How long the pile spends peeled back over a judged call before anything is
 * allowed to move again: long enough to fan the pile aside and then read the
 * two cards that decide it, since a glimpse of the evidence would be
 * decoration rather than evidence.
 *
 * The table sees the evidence, then the ruling, then the consequence — a rewind
 * that started underneath the evidence would be the consequence arriving first.
 * `Table.tsx` holds the peel itself up for exactly this long, and the ruling
 * banner follows it. (#63)
 */
export const PEEL_MS = 1700;
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

/**
 * How big the cards are where they come to rest, which is not the same on every
 * screen the table has.
 *
 * A flight is drawn at its destination's size and scaled from its origin's, so
 * these numbers are the difference between a card that lands and one that lands
 * and then pops. The layout owns them; this module only has to be told.
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
 * A phone in landscape (#78): your hand takes the screen, and the piles shrink
 * into the peek strip. No seats are drawn at all, so `seat` is only what a
 * flight to one *would* have been — those flights find no anchor and are
 * dropped, which `TableMotion` already handles.
 *
 * `hand` is the size the row settles on when it has the height for it, which is
 * every landscape phone. On a shorter box `handFan.ts` drops the cards to `lg`
 * and a card in flight lands one size large — a shrink of a few pixels on a
 * viewport nobody is playing at, and not worth threading a measurement through
 * the motion layer for.
 */
export const PEEK_TABLE: TableScale = { hand: "xl", pile: "sm", seat: "sm" };

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
        // The punishment card is played face up like any other card. There is
        // no longer any way for a card to leave a hand and *not* land on the
        // pile — the bad-call burial went with the wrong-call forfeit.
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

      case "reshuffled": {
        for (let index = 0; index < RESHUFFLE_CARDS; index += 1) {
          add({
            card: null,
            from: [PILE],
            to: [DECK],
            size: scale.pile,
            fromSize: scale.pile,
            duration: RESHUFFLE_MS,
            hides: null,
            toPile: false,
          });
          cursor += 60;
        }
        cursor += BEAT_MS;
        break;
      }

      /**
       * The rewind, which is the only part of a landed call the table can't
       * simply read off the cards afterwards. Every card the offender drew
       * illegally goes back where it came from, and it has to be *seen* going
       * back: the punishment that follows only makes sense if you watched the
       * game step backwards first (#66).
       *
       * The peel runs first and nothing may move underneath it, so the whole
       * sequence starts on the far side of it — including anything else that
       * arrived in the same batch. A beat then opens the rewind so the ruling
       * lands before the cards move, and another closes it so the forced play
       * doesn't tread on it. A call that missed moves nothing at all, but it
       * peels just the same, and the hold is what the table is watching.
       */
      case "sunnyCalled": {
        cursor += PEEL_MS;
        if (event.returned.length === 0) break;
        cursor += CALL_BEAT_MS;
        for (const card of event.returned) {
          add({
            card,
            // By now the rewind has already taken it out of the hand, so the
            // card's own anchor is gone and the hand as a whole is the origin.
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
 * Keep a burst inside its window.
 *
 * Bots move on a timer, and a resolved Sunny call can land half a dozen events
 * at once. Rather than let the table narrate a queue it has already left
 * behind, squeeze the delays so the whole batch still finishes promptly.
 *
 * The cap is on how long the burst takes, not on how long the table waits
 * before it starts. A batch that opens with a deliberate hold — the peel — is
 * measured from the end of it, because squeezing the hold would drag the rewind
 * back underneath the evidence it is meant to follow.
 */
const compress = (flights: FlightPlan[]): FlightPlan[] => {
  if (flights.length === 0) return flights;
  const delays = flights.map((flight) => flight.delay);
  const held = Math.min(...delays);
  const span = Math.max(...delays) - held;
  if (span <= BATCH_CAP_MS) return flights;
  const factor = BATCH_CAP_MS / span;
  return flights.map((flight) => ({
    ...flight,
    delay: held + Math.round((flight.delay - held) * factor),
  }));
};

/** When the last card in a batch comes to rest. */
export const settlesAt = (flights: readonly FlightPlan[]): number =>
  Math.max(0, ...flights.map((flight) => flight.delay + flight.duration));
