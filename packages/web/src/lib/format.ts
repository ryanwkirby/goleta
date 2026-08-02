import type { GameEvent, RoomView, SurrenderReason } from "@goleta/engine";

import { SUIT_LABEL } from "../components/Card.tsx";

export type NameOf = (playerId: string) => string;

export const namerFor = (room: RoomView | null): NameOf => {
  const names = new Map(room?.seats.map((seat) => [seat.id, seat.name]));
  return (playerId) => names.get(playerId) ?? "Someone";
};

const surrenderPhrase: Record<SurrenderReason, string> = {
  sunnyPunishment: "played the punishment card",
};

/** One event, as a sentence for the table log. */
export const describeEvent = (event: GameEvent, nameOf: NameOf): string => {
  switch (event.type) {
    case "gameStarted":
      return `New game. ${event.upcard.rank}${event.upcard.suit} turned up.`;
    case "played":
      return `${nameOf(event.playerId)} played ${event.card.rank}${event.card.suit}.`;
    case "suitChosen":
      return `${nameOf(event.playerId)} called ${SUIT_LABEL[event.suit]}.`;
    case "drew":
      return `${nameOf(event.playerId)} drew ${event.card.rank}${event.card.suit}.`;
    case "reshuffled":
      return `Deck ran out — the pile is shuffled back in, ${event.drawPileSize} to draw.`;
    case "turnedUp": {
      const cards = event.cards.map((card) => `${card.rank}${card.suit}`).join(", ");
      return event.reason === "recycle"
        ? `${cards} turned up. That's the card to match now.`
        : `${cards} turned up off the deck — the card they reached for. That's the card to match now.`;
    }
    case "sunnyCalled": {
      // The named card is the substance of the call, so the log carries it —
      // it is what makes a wrong call worth reading back afterwards.
      const named = `${event.card.rank}${event.card.suit}`;
      const call = `${nameOf(event.callerId)} called the Sunny Rule on ${nameOf(event.targetId)}, naming the ${named}`;
      return event.correct ? `${call} — and was right.` : `${call} — and was wrong.`;
    }
    case "surrendered":
      return `${nameOf(event.playerId)} ${surrenderPhrase[event.reason]}: ${event.card.rank}${event.card.suit}.`;
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
