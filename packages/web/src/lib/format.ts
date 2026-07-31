import type { DisposalReason, EventView, RoomView } from "@goleta/engine";

import { SUIT_LABEL } from "../components/Card.tsx";

export type NameOf = (playerId: string) => string;

export const namerFor = (room: RoomView | null): NameOf => {
  const names = new Map(room?.seats.map((seat) => [seat.id, seat.name]));
  return (playerId) => names.get(playerId) ?? "Someone";
};

const disposalPhrase: Record<DisposalReason, string> = {
  sunnyDrawn: "loses the card they drew",
  sunnyPunishment: "pays the punishment card",
  sunnyBadCall: "pays for a bad call",
};

/** One event, as a sentence for the table log. */
export const describeEvent = (event: EventView, nameOf: NameOf): string => {
  switch (event.type) {
    case "gameStarted":
      return `New game. ${event.upcard.rank}${event.upcard.suit} turned up.`;
    case "played":
      return `${nameOf(event.playerId)} played ${event.card.rank}${event.card.suit}.`;
    case "suitChosen":
      return `${nameOf(event.playerId)} called ${SUIT_LABEL[event.suit]}.`;
    case "drew":
      return event.card
        ? `${nameOf(event.playerId)} drew ${event.card.rank}${event.card.suit}.`
        : `${nameOf(event.playerId)} drew a card.`;
    case "reshuffled":
      return `Piles recycled — ${event.drawPileSize} cards back in the draw pile.`;
    case "sunnyCalled":
      return event.correct
        ? `${nameOf(event.callerId)} called the Sunny Rule on ${nameOf(event.targetId)} — and was right.`
        : `${nameOf(event.callerId)} called the Sunny Rule on ${nameOf(event.targetId)} — and was wrong.`;
    case "disposed": {
      const cards = event.cards.map((card) => `${card.rank}${card.suit}`).join(", ");
      return `${nameOf(event.playerId)} ${disposalPhrase[event.reason]}: ${cards}.`;
    }
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
export const isNoteworthy = (event: EventView): boolean =>
  event.type === "sunnyCalled" || event.type === "eliminated" || event.type === "gameOver";
