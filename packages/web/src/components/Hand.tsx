import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from "react";

import type { Card } from "@goleta/engine";

import { TIGHTEST } from "../lib/handFan.ts";
import { NEXT_SORT, SORT_LABELS, type HandSort } from "../lib/sort.ts";
import { cardAnchor, HAND } from "../lib/anchors.ts";
import { useMotion } from "../lib/motion.ts";
import { PlayingCard } from "./Card.tsx";
import type { HandMode } from "../lib/handMode.ts";
import { CARD_WIDTH_PX, cardWidthAt, type CardSize } from "../lib/cardShape.ts";

/**
 * `forced` is the play you owe after a Sunny call has landed on you. It plays a
 * card like `play` does, but it commits on the second tap like `surrender`
 * does: it is one step of a punishment, and a punishment you can fire off with
 * a stray thumb is one you never find out you were served (#66).
 */

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
  height,
  step,
  irl = false,
  fit = false,
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
   * Drawn at this height instead of at `size`, so the landscape hand can fill
   * the row it was given rather than fall back to the nearest rung (#166).
   */
  height?: number;
  /**
   * Left edge to left edge, in pixels — see `handFan.ts`.
   *
   * Required, and it did not use to be: the upright table passed nothing and
   * got a plain `gap-1.5` row that overflowed and scrolled sideways, which is
   * the failure #59 abolished everywhere except the one view that never got the
   * fix (#191). Both callers measure their row now, so there is no unfanned
   * branch left to fall into — and a hand fitted to a box it was never measured
   * against is not a fallback worth keeping around.
   *
   * A hand with room to spare is handed `loosest`, which is a whole card and
   * six pixels of air. That is the same spacing the old plain row had, so
   * nothing about a hand that fits looks any different for this.
   */
  step: number;
  /** IRL cards carry mirrored indices so the far side of the table can read them. */
  irl?: boolean;
  /**
   * A fitted landscape hand closes up rather than scrolling, and may be squeezed
   * past the tap floor to do it. Once it has been, one tap only raises a card
   * and the second commits — the tap target is gone, so the confirm replaces it.
   * Merely overlapping is not enough; see `choose`.
   */
  fit?: boolean;
}) {
  // One width for the fan and for every card in it: off the height when this
  // hand has been given one, off the ladder when it has not.
  const cardWidth = height ? cardWidthAt(height) : CARD_WIDTH_PX[size];

  const [selected, setSelected] = useState<string | null>(null);
  const { anchor, isArriving, reduced } = useMotion();
  const legal = new Set(legalCardIds);

  const hand = useRef<HTMLDivElement>(null);
  const handAnchor = anchor(HAND);
  const setHandRef = useCallback(
    (element: HTMLDivElement | null) => {
      hand.current = element;
      return handAnchor(element);
    },
    [handAnchor],
  );
  const nodes = useRef(new Map<string, HTMLElement>());
  const places = useRef(new Map<string, [number, number]>());
  const reflows = useRef(new Map<string, Animation>());
  const refs = useRef(new Map<string, RefCallback<HTMLElement>>());
  const previousCards = useRef<ReadonlySet<string>>(new Set(cards.map((card) => card.id)));

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

  useLayoutEffect(() => {
    const before = previousCards.current;
    const drawn = cards.find((card) => !before.has(card.id));
    previousCards.current = new Set(cards.map((card) => card.id));
    if (!drawn) return;

    const row = hand.current;
    const card = nodes.current.get(drawn.id);
    if (!row || !card) return;

    const left = card.offsetLeft;
    const right = left + card.offsetWidth;
    const visibleLeft = row.scrollLeft;
    const visibleRight = visibleLeft + row.clientWidth;
    let next = visibleLeft;
    if (left < visibleLeft) next = left;
    else if (right > visibleRight) next = right - row.clientWidth;
    if (Math.abs(next - visibleLeft) < 1) return;

    const gliding = !reduced && document.visibilityState === "visible";
    row.scrollTo({ left: next, behavior: gliding ? "smooth" : "auto" });
  }, [cards, reduced]);

  useEffect(() => {
    if (!selected) return;
    const cancel = (event: PointerEvent): void => {
      if (hand.current?.contains(event.target as Node)) return;
      setSelected(null);
    };
    document.addEventListener("pointerdown", cancel);
    return () => document.removeEventListener("pointerdown", cancel);
  }, [selected]);

  useEffect(() => {
    if (selected && !cards.some((card) => card.id === selected)) setSelected(null);
  }, [cards, selected]);

  // No invitation to stay and watch: by the time most people read this the game
  // has finished, and being told to sit tight for an ending that already
  // happened reads as an app that doesn't know what state it's in. The table
  // below is still there for anyone who wants the rest of it.
  if (cards.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-white/50">
        You're out of cards, and out of the game.
      </p>
    );
  }

  const choose = (card: Card): void => {
    if (mode === "idle") return;
    // Squeezed past the tap floor, not merely overlapping. Any overlap at all
    // starts at seven cards on a landscape phone, where the cards still leave
    // 116px to aim at and there is nothing to disambiguate — asking twice there
    // is the confirm-on-every-card the comment below rules out, and a hand only
    // ever reaches about a dozen (the simulation's worst across 300 games), so
    // it would have been the normal case rather than the exception. Below
    // `TIGHTEST` the sliver is genuinely thinner than a thumb, which is the
    // condition #117 names and the only one worth a second tap.
    const tight = step < TIGHTEST;
    const mustConfirm = CONFIRMS.has(mode) || (fit && tight);
    // The moves you can't take back ask twice, and so does a card too thin to
    // be sure you hit. Ordinary play doesn't: it is the whole rhythm of a turn,
    // and a confirm on every card would wreck it.
    if (mustConfirm && selected !== card.id) {
      setSelected(card.id);
      return;
    }
    setSelected(null);
    onChoose(card.id);
  };

  return (
    <div
      ref={setHandRef}
      // Cards slide left onto their neighbours by `--fan`, exactly as the seat
      // strip does it: later cards paint over earlier ones by DOM order, so no
      // `z-index` is needed. `justify-center` is what makes a short hand sit in
      // the middle of a wide landscape screen rather than hugging one edge —
      // `overflow-x-auto` only overrides it once there is genuinely too much.
      style={{ "--fan": `${step - cardWidth}px` } as CSSProperties}
      className={[
        // Same air above the cards as below them. The top has to clear the 14px
        // a selected card lifts — this row sets `overflow-x`, which makes the
        // vertical axis scroll with it, so anything rising past the padding gets
        // clipped — and the bottom never needed to, so it never got it. Nobody
        // read the pair together until the turn ring was drawn around them and
        // the hand sat visibly low in its own frame.
        "flex items-end py-4",
        // The row's width *is* the width the fan was fitted to, so it keeps no
        // padding of its own — an inset here and an inset in the arithmetic are
        // two places to disagree, and they did.
        // `auto` rather than `hidden`. A fitted hand fits by construction, so
        // the scrollbar never appears — but `fit` has a floor, and past it
        // clipping the ends silently would hide cards the turn needs. Scrolling
        // is the release valve, exactly as it is for the seat strip (#59).
        "justify-center overflow-x-auto [&>*+*]:ml-[var(--fan)]",
      ].join(" ")}
      onClick={(event) => {
        if (event.target === event.currentTarget) setSelected(null);
      }}
    >
      {cards.map((card) => {
        const playable = legal.has(card.id);
        return (
          <PlayingCard
            key={card.id}
            card={card}
            size={size}
            height={height}
            mirrored={irl}
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
