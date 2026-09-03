/**
 * Turns a batch of events into the card flights that describe them. Pure: it
 * decides *what* moves where and in what order, never how it is drawn. The
 * engine emits no per-card deal event and shouldn't — a deal is not a rule — so
 * `gameStarted` is expanded here from the hands the state already carries.
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
const DEAL_BEAT_MS = 38;
const DEAL_WINDOW_MS = 820;
/** A burst that would run longer than this is compressed rather than queued. */
const BATCH_CAP_MS = 900;

/** The last beat of a wait, given over to the card arriving. See `revealAt`. */
const REVEAL_MS = 110;

/** Slowly enough to watch: the last card lands around 3.7s into a 4.8s beat,
 * leaving a held second for the words. Every one is face down and must stay that
 * way — the recycled pile's order *is* deck order, which `redact.ts` guards. */
export const RESHUFFLE_CARDS = 9;
export const RESHUFFLE_BEAT_MS = 380;
const RESHUFFLE_FLIGHT_MS = 620;

export interface FlightPlan {
  id: string;
  /** Null flies face down — a deal, which nobody watches card by card. */
  card: Card | null;
  from: AnchorKey[];
  to: AnchorKey[];
  /** Rendered at the destination's size — that's where it comes to rest. */
  size: CardSize;
  fromSize: CardSize;
  delay: number;
  duration: number;
  /** A card kept invisible in the hand it is joining until this lands. */
  hides: string | null;
  toPile: boolean;
}

export interface Planned {
  flights: FlightPlan[];
  /** The pile is empty until the upcard lands, so it must stop drawing a card. */
  emptiesPile: boolean;
  /** Reported because one prompt has to wait for it: under Dealer's Choice the
   * game opens in `phase: "suit"` and the dealer was asked to name a suit while
   * the cards were still in the air (#75). */
  deals: boolean;
}

/** A flight is drawn at its destination's size and scaled from its origin's, so
 * these are the difference between a card that lands and one that lands and
 * then pops. */
export interface TableScale {
  hand: CardSize;
  pile: CardSize;
  seat: CardSize;
}

export const FULL_TABLE: TableScale = { hand: "md", pile: "lg", seat: "sm" };

/** A phone in landscape (#78): the hand takes the screen and the piles shrink
 * into the peek strip. No seats are drawn, so a flight to one finds no anchor
 * and is dropped. */
export const PEEK_TABLE: TableScale = { hand: "2xl", pile: "sm", seat: "sm" };

/** The shared screen (#200): one size, because everything on that board is drawn
 * at the piles' size and then fitted by `fitScale`, and because there are no
 * hands on it for a card to be a different size in. */
export const TABLE_SCREEN: TableScale = { hand: "xl", pile: "xl", seat: "xl" };

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
        // It still flies to the pile — there is no way for a card to leave a hand
        // and not land there — but since #364 it is tucked into the *bottom* of
        // the pile rather than played onto the top, so the top card does not
        // change when it arrives. The movement is the whole explanation and
        // there is no caption to add; whether it should read as sliding
        // underneath is a presentation question this does not answer.
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
            // The rewind has already taken it out of the hand, so its own anchor
            // is out of the live DOM — but `resolveAnchor` falls through to the
            // previous commit's geometry, which still has it, so what this
            // actually resolves to is the place the card held when it was taken.
            // That is the right origin and it is also why nothing may be
            // *painted* there while the peel runs: the hand closes up over those
            // places inside 190ms (#409). The hand is the backstop, for a seat
            // that has gone off screen since.
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

/**
 * **A flight is not drawn until it moves** (#409), and this is the window in
 * which it turns up.
 *
 * The flight layer parks a card at its origin for the whole of its `delay` —
 * it has to, or a card with a delay would sit in the corner of the screen until
 * its turn — and for most of what is planned here that costs nothing: a deal's
 * cards wait on the deck, under the deck, and the 110ms between the cards of an
 * ordinary burst is not long enough to read as anything.
 *
 * The holds above are a different matter. A landed call keeps its rewind back by
 * the whole of `PEEL_MS` so it cannot start underneath the evidence, and a
 * recycle keeps the rest of its batch back by `RESHUFFLE_MS` — so the cards
 * about to come off the offender's hand were painted over that hand, tilted, at
 * places it had already closed up over, for the better part of three seconds;
 * and a recycle's nine cards sat face down on top of the card in play waiting
 * their turn. Neither was saying anything, and the first was reported as the
 * hand splaying out on its own.
 *
 * So the card is held at nothing until its wait is nearly over and fades in
 * across the last beat of it, arriving whole on the frame it starts to travel.
 * **A flight with no wait keeps no fade**: an immediate flight is most of them,
 * and it is drawn exactly as it always was.
 *
 * The shared table screen has always worked this way — `table-screen-card` opens
 * at `opacity: 0` under a `both` fill — which is where the rule comes from rather
 * than being invented here.
 */
export const revealAt = (delay: number): { delay: number; duration: number } => {
  const fade = delay > REVEAL_MS ? REVEAL_MS : delay > 0 ? delay : 0;
  return { delay: delay - fade, duration: fade };
};

/** When the last card in a batch comes to rest. */
export const settlesAt = (flights: readonly FlightPlan[]): number =>
  Math.max(0, ...flights.map((flight) => flight.delay + flight.duration));
