import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from "react";

import type { Card } from "@goleta/engine";

import { NEXT_SORT, SORT_LABELS, type HandSort } from "../lib/sort.ts";
import { cardAnchor, HAND } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import { CARD_WIDTH_PX, PlayingCard, type CardSize } from "./Card.tsx";

/**
 * `forced` is the play you owe after a Sunny call has landed on you. It plays a
 * card like `play` does, but it commits on the second tap like `surrender`
 * does: it is one step of a punishment, and a punishment you can fire off with
 * a stray thumb is one you never find out you were served (#66).
 */
export type HandMode = "play" | "forced" | "surrender" | "idle";

/** The moves that ask twice, because you can't take them back. */
const CONFIRMS: ReadonlySet<HandMode> = new Set<HandMode>(["forced", "surrender"]);

/** How long the hand takes to close a gap, or open one. */
const REFLOW_MS = 190;

/**
 * The one control over your own cards: tap to cycle how they're arranged.
 *
 * Quiet, and next to the offer of help rather than anywhere near the table —
 * it changes nothing about the game, only about your eyes. The cards slide to
 * their new places on the reflow below, so where a card went is watchable.
 */
export function HandSortButton({
  sort,
  onCycle,
  className = "",
}: {
  sort: HandSort;
  onCycle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onCycle}
      title={`Your hand is ${SORT_LABELS[sort]}. Tap to sort it ${SORT_LABELS[NEXT_SORT[sort]]}.`}
      className={[
        "rounded-lg px-2 py-1 text-xs text-white/35",
        "transition-colors hover:bg-white/5 hover:text-white/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        className,
      ].join(" ")}
    >
      sort: {SORT_LABELS[sort]}
    </button>
  );
}

export function Hand({
  cards,
  legalCardIds,
  mode,
  assist,
  onChoose,
  size = "md",
  step = null,
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
  size?: CardSize;
  /**
   * Left edge to left edge, in pixels, when the hand has to close up to fit —
   * see `handFan.ts`. Null spaces the cards out with a plain gap, which is
   * what the full table has always done and what a wide screen never needs to
   * improve on.
   */
  step?: number | null;
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
    // The moves you can't take back ask twice. Ordinary play doesn't: it is the
    // whole rhythm of a turn, and a confirm on every card would wreck it.
    if (CONFIRMS.has(mode) && selected !== card.id) {
      setSelected(card.id);
      return;
    }
    setSelected(null);
    onChoose(card.id);
  };

  return (
    <div
      ref={anchor(HAND)}
      // Cards slide left onto their neighbours by `--fan`, exactly as the seat
      // strip does it: later cards paint over earlier ones by DOM order, so no
      // `z-index` is needed. `justify-center` is what makes a short hand sit in
      // the middle of a wide landscape screen rather than hugging one edge —
      // `overflow-x-auto` only overrides it once there is genuinely too much.
      style={step === null ? undefined : ({ "--fan": `${step - CARD_WIDTH_PX[size]}px` } as CSSProperties)}
      className={[
        // Same air above the cards as below them. The top has to clear the 14px
        // a selected card lifts — this row sets `overflow-x`, which makes the
        // vertical axis scroll with it, so anything rising past the padding gets
        // clipped — and the bottom never needed to, so it never got it. Nobody
        // read the pair together until the turn ring was drawn around them and
        // the hand sat visibly low in its own frame.
        "flex items-end overflow-x-auto py-4",
        // With a step, the row's width *is* the width the fan was fitted to, so
        // it keeps no padding of its own — an inset here and an inset in the
        // arithmetic are two places to disagree, and they did.
        step === null ? "gap-1.5 px-1" : "justify-center [&>*+*]:ml-[var(--fan)]",
      ].join(" ")}
    >
      {cards.map((card) => {
        const playable = legal.has(card.id);
        return (
          <PlayingCard
            key={card.id}
            card={card}
            size={size}
            anchor={refFor(card.id)}
            arriving={isArriving(card.id)}
            // With help on, the unplayable cards are dimmed. Without it they
            // all look alike. When giving a card up, legality is irrelevant,
            // so nothing is dimmed either way.
            dimmed={(mode === "play" || mode === "forced") && assist && !playable}
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
