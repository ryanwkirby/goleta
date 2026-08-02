import type { Card, GameEvent, RoomView, SurrenderReason } from "@goleta/engine";

import { SUIT_GLYPH, SUIT_LABEL } from "../components/Card.tsx";

export type NameOf = (playerId: string) => string;

/** A card as the log names it: `7♠`, not `7S`. */
const cardName = (card: Card): string => `${card.rank}${SUIT_GLYPH[card.suit]}`;

const SPOKEN_GLYPH: Record<string, string> = {
  "♣": " of clubs",
  "♦": " of diamonds",
  "♥": " of hearts",
  "♠": " of spades",
};

/**
 * The same line with its pips spelled out, for a screen reader.
 *
 * A bare `♠` is announced inconsistently and often not at all — at the usual
 * punctuation settings it's simply dropped, which turns "played 7♠" into
 * "played 7". The glyph is what you want to see and the wrong thing to hear, so
 * the log shows one and says the other. Cards come out as "7 of spades", the
 * same phrasing `PlayingCard` already uses for its own label.
 */
export const spellSuits = (line: string): string =>
  line.replace(/[♣♦♥♠]/g, (glyph) => SPOKEN_GLYPH[glyph] ?? glyph);

export const namerFor = (room: RoomView | null): NameOf => {
  const names = new Map(room?.seats.map((seat) => [seat.id, seat.name]));
  return (playerId) => names.get(playerId) ?? "Someone";
};

const surrenderPhrase: Record<SurrenderReason, string> = {
  sunnyPunishment: "played the punishment card",
  sunnyBadCall: "buried a card for a bad call",
};

/** One event, as a sentence for the table log. */
export const describeEvent = (event: GameEvent, nameOf: NameOf): string => {
  switch (event.type) {
    case "gameStarted":
      return `New game. ${cardName(event.upcard)} turned up.`;
    case "played":
      return `${nameOf(event.playerId)} played ${cardName(event.card)}.`;
    case "suitChosen":
      return `${nameOf(event.playerId)} called ${SUIT_LABEL[event.suit]}.`;
    case "drew":
      return `${nameOf(event.playerId)} drew ${cardName(event.card)}.`;
    case "reshuffled":
      return `Deck ran out — the pile is shuffled back in, ${event.drawPileSize} to draw.`;
    case "turnedUp": {
      const cards = event.cards.map(cardName).join(", ");
      return event.reason === "recycle"
        ? `${cards} turned up. That's the card to match now.`
        : `${cards} turned up off the deck — the card they reached for. That's the card to match now.`;
    }
    case "sunnyCalled":
      return event.correct
        ? `${nameOf(event.callerId)} called the Sunny Rule on ${nameOf(event.targetId)} — and was right.`
        : `${nameOf(event.callerId)} called the Sunny Rule on ${nameOf(event.targetId)} — and was wrong.`;
    case "surrendered":
      return `${nameOf(event.playerId)} ${surrenderPhrase[event.reason]}: ${cardName(event.card)}.`;
    case "eliminated":
      return `${nameOf(event.playerId)} is out of cards, and out of the game.`;
    case "turnChanged":
      return `${nameOf(event.playerId)} to play.`;
    case "gameOver":
      if (event.winnerId === null) return "Deadlock — the game ends in a tie.";
      return event.reason === "stalemate"
        ? `Deadlock. ${nameOf(event.winnerId)} wins on cards held.`
        : `${nameOf(event.winnerId)} is the last one holding cards. They win.`;
  }
};

/** Events worth interrupting someone for, rather than just logging. */
export const isNoteworthy = (event: GameEvent): boolean =>
  event.type === "sunnyCalled" || event.type === "eliminated" || event.type === "gameOver";
