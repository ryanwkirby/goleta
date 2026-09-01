/**
 * Your own cards, and the one control over them. **Rules converge here**;
 * `AGENTS.md` § "Rules that look like bugs and are not" is the authority.
 * Nothing marks a playable card except under `assist` (#33), the tooltip
 * included; `assist` is a setting you keep and it is public (#187); and
 * `legalCardIds` is your own hand and nobody else's, by `redact.ts`.
 */

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
import { cardWidthAt, cardWidthPx, type CardSize } from "../lib/cardShape.ts";
import { usePrintScale } from "../lib/largePrint.ts";

/** `forced` plays a card like `play` but commits on the second tap like
 * `surrender`: a punishment you can fire off with a stray thumb is one you never
 * find out you served. */

/** The moves that ask twice, because you can't take them back. */
const CONFIRMS: ReadonlySet<HandMode> = new Set<HandMode>(["forced", "surrender"]);

const REFLOW_MS = 190;

/** The up/down pair. Drawn rather than typed, like every other glyph here since
 * #296 — an arrow character is a gamble on the device's font, and this one has to
 * read at small print size in two layouts. */
function SortGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M7 4v16M7 20l-3.2-3.4M7 20l3.2-3.4" />
      <path d="M17 20V4M17 4l-3.2 3.4M17 4l3.2 3.4" />
    </svg>
  );
}

/**
 * Quiet, and next to the offer of help rather than near the table — it changes
 * nothing about the game.
 *
 * **A glyph that speaks when pressed** (#328). It used to read `sort: by suit`
 * and say so for the whole game, which is a setting reading itself back to you on
 * every turn of every hand for the one moment a year you change it. Now it is the
 * glyph until you press it, and the words arrive for a couple of seconds
 * afterwards and go again.
 *
 * The label is **absolute and out of the flow**, to the left of the glyph — which
 * is the end of both of its rows, so it grows towards the middle of the screen
 * rather than off the edge of it. Nothing may take room the hand is using or move
 * the cards under a thumb (#131), and that holds in both layouts: upright the row
 * is kept clear whether or not anything is in it, and in landscape this is
 * already an absolute corner over the felt (#167).
 *
 * It arrives on `help-offer`'s own rise-and-fade and leaves on it reversed, held
 * in between — one animation for the whole life of the thing, the shape
 * `move-refusal` uses, so there is no timer here to fall out of step with the
 * CSS. It is `aria-hidden`, and the `sr-only` live region next to it is what a
 * screen reader is told instead: the words being transient must not make the
 * change inaudible.
 *
 * `NEXT_SORT` and `SORT_LABELS` do not move. This is presentation; the sort
 * itself is still cosmetic and yours alone.
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
  /** Which tap the words on screen belong to. Zero is silence; a fresh number
   * remounts the label, so tapping again restarts it rather than being swallowed
   * by an animation already running. */
  const [spoken, setSpoken] = useState(0);

  return (
    <button
      type="button"
      onClick={() => {
        onCycle();
        setSpoken((tap) => tap + 1);
      }}
      // The only place a pointer can find out what the sort currently is.
      title={`Your hand is ${SORT_LABELS[sort]}. Tap to sort it ${SORT_LABELS[NEXT_SORT[sort]]}.`}
      aria-label={`Sort your hand — ${SORT_LABELS[sort]}`}
      className={[
        "relative rounded-lg px-2 py-1 text-white/35",
        "transition-colors hover:bg-white/5 hover:text-white/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        className,
      ].join(" ")}
    >
      <SortGlyph />
      {/* The box is centred on the glyph and never animated; the words inside it
          are, so the animation's own `transform` cannot fight the centring. */}
      <span className="pointer-events-none absolute inset-y-0 right-full mr-1 flex items-center">
        {spoken > 0 ? (
          <span
            key={spoken}
            aria-hidden
            onAnimationEnd={() => setSpoken(0)}
            className="animate-sort-said whitespace-nowrap text-xs text-white/50"
          >
            {SORT_LABELS[sort]}
          </span>
        ) : null}
      </span>
      <span className="sr-only" aria-live="polite">
        {`Your hand is ${SORT_LABELS[sort]}.`}
      </span>
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
  /** Off unless this player has turned it on — see the header, and #187. */
  assist: boolean;
  onChoose: (cardId: string) => void;
  size?: CardSize;
  /** So the landscape hand can fill the row it was given rather than fall back to
   * a rung (#166). */
  height?: number;
  /**
   * Left edge to left edge — see `handFan.ts`. Required, and it did not use to
   * be: the upright table passed nothing and got a plain row that overflowed and
   * scrolled sideways, the failure #59 abolished everywhere but the one view
   * that never got the fix (#191).
   */
  step: number;
  /** IRL cards carry mirrored indices so the far side of the table can read them. */
  irl?: boolean;
  /** A fitted landscape hand closes up rather than scrolling, and may be squeezed
   * past the tap floor to do it — past which one tap raises a card and the second
   * commits. See `choose`. */
  fit?: boolean;
}) {
  // One width for the fan and every card in it. A measured height already has
  // large print in it; a rung has to be told (#323).
  const scale = usePrintScale();
  const cardWidth = height ? cardWidthAt(height) : cardWidthPx(size, scale);

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

  /** Two jobs: telling the motion layer where the card is, and keeping a handle
   * for the reflow below. */
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
   * Cards close the gap when one leaves and make room when one joins — the same
   * movement the flying card describes, seen from the other end. Offsets, not
   * bounding boxes: `offsetLeft` ignores transforms, so a card mid-slide can't
   * poison the next measurement.
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
  // has finished, and being told to sit tight for an ending that already happened
  // reads as an app that doesn't know what state it's in.
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
    // Below `TIGHTEST` the sliver is thinner than a thumb, which is the condition
  // #117 names and the only one worth a second tap.
    const tight = step < TIGHTEST;
    const mustConfirm = CONFIRMS.has(mode) || (fit && tight);
    // The moves you can't take back ask twice, and so does a card too thin to be
    // sure you hit. A confirm on every card would wreck the rhythm of a turn.
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
      // `justify-center` keeps a short hand in the middle of a wide landscape screen;
      // `overflow-x-auto` only overrides it once there is genuinely too much.
      style={{ "--fan": `${step - cardWidth}px` } as CSSProperties}
      className={[
        // Same air above the cards as below: the top has to clear the 14px a selected
        // card lifts, since this row sets `overflow-x` and the vertical axis
        // scrolls with it.
        "flex items-end py-4",
        // The row's width *is* the width the fan was fitted to, so it keeps no padding
        // of its own. `auto` rather than `hidden`: `fit` has a floor, and past it
        // clipping the ends would hide cards the turn needs.
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
            // With help on the unplayable cards are dimmed. Giving a card up, legality is
            // irrelevant either way.
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
