import { useState } from "react";

import type { Card } from "@goleta/engine";

import { PlayingCard } from "./Card.tsx";

export type HandMode = "play" | "surrender" | "idle";

export function Hand({
  cards,
  legalCardIds,
  mode,
  onChoose,
}: {
  cards: Card[];
  legalCardIds: string[];
  mode: HandMode;
  onChoose: (cardId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const legal = new Set(legalCardIds);

  if (cards.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-white/50">
        You're out of cards, and out of the game. Stay and watch how it ends.
      </p>
    );
  }

  const choose = (card: Card): void => {
    if (mode === "idle") return;
    // Giving up a card is the one move you can't take back, so it asks twice.
    if (mode === "surrender" && selected !== card.id) {
      setSelected(card.id);
      return;
    }
    setSelected(null);
    onChoose(card.id);
  };

  return (
    <div className="flex items-end gap-1.5 overflow-x-auto px-1 pb-2 pt-6">
      {cards.map((card) => {
        const playable = legal.has(card.id);
        return (
          <PlayingCard
            key={card.id}
            card={card}
            size="md"
            // In play mode the unplayable cards are dimmed. When giving a card
            // up, legality is irrelevant, so nothing is dimmed.
            dimmed={mode === "play" && !playable}
            selected={selected === card.id}
            onClick={mode === "idle" ? undefined : () => choose(card)}
            title={
              mode === "surrender"
                ? selected === card.id
                  ? "Tap again to give it up"
                  : "Give up this card"
                : playable
                  ? "Play this card"
                  : "Doesn't match"
            }
          />
        );
      })}
    </div>
  );
}
