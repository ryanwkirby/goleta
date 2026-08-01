import { useLayoutEffect, useRef, useState, type RefCallback } from "react";

import type { Card } from "@goleta/engine";

import { cardAnchor, HAND } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import { PlayingCard } from "./Card.tsx";

export type HandMode = "play" | "surrender" | "idle";

/** How long the hand takes to close a gap, or open one. */
const REFLOW_MS = 190;

export function Hand({
  cards,
  legalCardIds,
  mode,
  assist,
  onChoose,
}: {
  cards: Card[];
  legalCardIds: string[];
  mode: HandMode;
  /**
   * Whether to mark up the cards you can play. Off by default once you've
   * finished a game — see `AGENTS.md`. Being able to see your own legal move
   * at a glance is exactly what stops you making the mistake the Sunny Rule
   * exists to punish, and the mistake is the game.
   */
  assist: boolean;
  onChoose: (cardId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { anchor, isArriving, reduced } = useMotion();
  const legal = new Set(legalCardIds);

  const nodes = useRef(new Map<string, HTMLElement>());
  const places = useRef(new Map<string, [number, number]>());
  const reflows = useRef(new Map<string, Animation>());
  const refs = useRef(new Map<string, RefCallback<HTMLElement>>());

  /**
   * One stable ref per card doing two jobs: telling the motion layer where this
   * card is, and keeping a handle for the reflow below.
   */
  const refFor = (cardId: string): RefCallback<HTMLElement> => {
    const cached = refs.current.get(cardId);
    if (cached) return cached;
    const register = anchor(cardAnchor(cardId));
    const combined: RefCallback<HTMLElement> = (element) => {
      if (element) nodes.current.set(cardId, element);
      const release = register(element);
      return () => {
        if (element && nodes.current.get(cardId) === element) nodes.current.delete(cardId);
        release?.();
      };
    };
    refs.current.set(cardId, combined);
    return combined;
  };

  /**
   * When a card leaves the hand the rest close the gap; when one joins, they
   * make room for it. Sliding beats teleporting — it's the same movement the
   * flying card is describing, seen from the other end.
   *
   * Offsets, not bounding boxes: `offsetLeft` ignores transforms, so a card
   * mid-slide or merely hovered can't poison the next measurement.
   */
  useLayoutEffect(() => {
    const before = places.current;
    const now = new Map<string, [number, number]>();
    for (const [cardId, node] of nodes.current) now.set(cardId, [node.offsetLeft, node.offsetTop]);
    places.current = now;
    if (reduced) return;

    for (const [cardId, [left, top]] of now) {
      const was = before.get(cardId);
      const node = nodes.current.get(cardId);
      if (!was || !node) continue;
      const dx = was[0] - left;
      const dy = was[1] - top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      reflows.current.get(cardId)?.cancel();
      reflows.current.set(
        cardId,
        node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
          { duration: REFLOW_MS, easing: "cubic-bezier(0.22, 0.72, 0.3, 1)" },
        ),
      );
    }
  });

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
    <div ref={anchor(HAND)} className="flex items-end gap-1.5 overflow-x-auto px-1 pb-2 pt-6">
      {cards.map((card) => {
        const playable = legal.has(card.id);
        return (
          <PlayingCard
            key={card.id}
            card={card}
            size="md"
            anchor={refFor(card.id)}
            arriving={isArriving(card.id)}
            // With help on, the unplayable cards are dimmed. Without it they
            // all look alike. When giving a card up, legality is irrelevant,
            // so nothing is dimmed either way.
            dimmed={mode === "play" && assist && !playable}
            selected={selected === card.id}
            onClick={mode === "idle" ? undefined : () => choose(card)}
            // The tooltip is a highlight in slow motion, so it stays quiet too.
            title={
              mode === "surrender"
                ? selected === card.id
                  ? "Tap again to give it up"
                  : "Give up this card"
                : assist && !playable
                  ? "Doesn't match"
                  : "Play this card"
            }
          />
        );
      })}
    </div>
  );
}
