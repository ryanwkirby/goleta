import type { Card, GameEvent, GameView, RoomView, SurrenderReason } from "@goleta/engine";

import { SUIT_GLYPH, SUIT_LABEL } from "./cardShape.ts";

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
 * The same line with its pips spelled out, for a screen reader. A bare `♠` is
 * announced inconsistently and often dropped, turning "played 7♠" into "played
 * 7" — so the log shows the glyph and says the words.
 */
export const spellSuits = (line: string): string =>
  line.replace(/[♣♦♥♠]/g, (glyph) => SPOKEN_GLYPH[glyph] ?? glyph);

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
      // Said here as well as shown: the log is what a table scrolls back through to
      // work out why the order looks wrong.
      return event.seatsShuffled
        ? `New game, seats shuffled. ${cardName(event.upcard)} turned up.`
        : `New game. ${cardName(event.upcard)} turned up.`;
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
    case "sunnyCalled": {
      // The named card is the substance of the call, and what makes a wrong one worth
      // reading back afterwards.
      const named = `${event.card.rank}${event.card.suit}`;
      const call = `${nameOf(event.callerId)} called the Sunny Rule on ${nameOf(event.targetId)}, naming the ${named}`;
      return event.correct ? `${call} — and was right.` : `${call} — and was wrong.`;
    }
    case "surrendered":
      return `${nameOf(event.playerId)} ${surrenderPhrase[event.reason]}: ${cardName(event.card)}.`;
    case "eliminated":
      return `${nameOf(event.playerId)} is out of cards, and out of the game.`;
    case "turnChanged":
      return `${nameOf(event.playerId)}'s turn.`;
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

/**
 * What the table is waiting for, said plainly. The two steps of a landed Sunny
 * call number themselves: "now the punishment card" on its own says nothing
 * about what happened or how much is left (#66).
 *
 * Both layouts compute this rather than being handed it, because `dealing` comes
 * from the motion layer and `Table` renders that provider rather than sitting
 * under it.
 */
export const turnPrompt = (
  game: GameView,
  nameOf: NameOf,
  assist: boolean,
  /** The cards are still going out; see `MotionApi.dealing`. */
  dealing = false,
  /**
   * How many cards there are to draw, while a reshuffle is being watched (#209).
   * The words go here because this line is the one surface all three screens
   * have. It outranks what the table is waiting for — for those five seconds the
   * answer to "what is happening" is the reshuffle.
   */
  reshuffling: number | null = null,
): string => {
  const mine = game.waitingOn === game.you;
  if (reshuffling !== null && game.phase.kind !== "over") {
    return `Deck ran out — shuffling the pile back in, ${reshuffling} to draw.`;
  }
  switch (game.phase.kind) {
    case "over":
      return game.winnerId
        ? `${nameOf(game.winnerId)} wins, still holding cards.`
        : "Deadlock — nobody could move.";
    case "surrender": {
      const yours = game.phase.playerId === game.you;
      const who = yours ? "You" : nameOf(game.phase.playerId);
      return yours
        ? "☀️ Step 2 of 3 — the punishment card. Any card in your hand; it doesn't have to match."
        : `${who} owes a punishment card — step 2 of 3.`;
    }
    case "suit":
      // The one prompt that waits on the deal, because it is the one that can arrive
      // before it: under Dealer's Choice the game opens in this phase, so the
      // dealer was asked to name a suit for an 8 still in the air (#75).
      if (dealing) return "Dealing…";
      // The namer, not the player to move — under Power of Eights the suit is owed by
      // the next seat, and under Dealer's Choice by the dealer.
      return mine ? "Name a suit." : `${nameOf(game.phase.playerId)} is naming a suit.`;
    case "sunnyPlay":
      return mine
        ? "☀️ Step 1 of 3 — make the play you skipped. Tap it twice."
        : `${nameOf(game.turnPlayerId)} has to make the play they skipped — step 1 of 3.`;
    case "action":
      if (!mine) return `${nameOf(game.turnPlayerId)}'s turn.`;
      // Both give the answer away — being told you *must* play is being told a card
      // matches — so neither is said unless help is on.
      if (!assist) return "Your turn.";
      return game.youMustPlay
        ? "Your turn — you have a card that matches, so you have to play it."
        : "Nothing matches. Draw a card.";
  }
};
