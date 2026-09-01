import type { CSSProperties, RefCallback } from "react";

import type { Card as CardModel } from "@goleta/engine";

// Type-only, so it is erased and there is no runtime dependency either way.
import type { PileSuit } from "../lib/pile.ts";
import {
  CARD_HEIGHT_PX,
  cardWidthAt,
  isRed,
  shapeFor,
  SUIT_GLYPH,
  SUIT_LABEL,
  type CardSize,
} from "../lib/cardShape.ts";
import { usePrintScale } from "../lib/largePrint.ts";

/** Re-exported because this is where people look for them. They live in
 * `lib/cardShape.ts` so `lib` can use them without importing a component (#224),
 * and a paired benchmark caught the bill: an agent asking "what does this app use
 * to draw a suit" then read both files. Only the suit helpers, not the ladder. */
export { isRed, SUIT_GLYPH, SUIT_LABEL } from "../lib/cardShape.ts";

/**
 * The ladder, as rem-based classes. Every one of these is the pixel pair
 * `CARD_WIDTH_PX`/`CARD_HEIGHT_PX` records divided by 16, and **the two have to
 * stay in step** — large print moves the root font size, which takes these up
 * and leaves the constants where they were unless somebody multiplies them too
 * (#323). Nothing would fail if they drifted, so `cardLadder.test.ts` reads this
 * table as text and fails instead.
 */
const SIZES: Record<CardSize, string> = {
  sm: "h-14 w-10 text-sm rounded-md p-1",
  md: "h-24 w-[4.25rem] text-xl rounded-lg p-1.5",
  lg: "h-32 w-24 text-2xl rounded-xl p-2",
  xl: "h-44 w-33 text-4xl rounded-2xl p-2.5",
  // 52px of rank, and the two indices still clear each other: 1.94× its own font
  // size apiece once the suit is counted, in a card 240 tall.
  "2xl": "h-60 w-45 text-[3.25rem] rounded-3xl p-3",
};

interface CardProps {
  card: CardModel;
  size?: CardSize;
  /** Drawn at this height in pixels rather than at `size`. The landscape hand sets
   * it; nothing else should. */
  height?: number;
  /** In-person cards need to be readable from both sides of the table. */
  mirrored?: boolean;
  /** Dimmed but still legible, and still opaque: you can see it, you just can't
   * play it — and it must not show its neighbours through it (#331). */
  dimmed?: boolean;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
  /** Still flying to this spot. It keeps its place in the layout and gives up only
   * its ink, so nothing shifts when it lands. */
  arriving?: boolean;
  /** Registers this card as a place a flight can start from or land on. */
  anchor?: RefCallback<HTMLElement>;
}

export function PlayingCard({
  card,
  size = "md",
  height,
  mirrored = false,
  dimmed = false,
  selected = false,
  onClick,
  title,
  arriving = false,
  anchor,
}: CardProps) {
  const glyph = SUIT_GLYPH[card.suit];
  const colour = isRed(card.suit) ? "text-rose-600" : "text-slate-900";
  const Tag = onClick ? "button" : "div";

  /** 1 unless this device is in large print (#323), in which case every rung is
   * this much bigger and the face is a different one. */
  const scale = usePrintScale();
  const large = scale !== 1;
  const shape = shapeFor(large);

  /**
   * A height replaces the rung's class outright rather than overriding half of
   * it: a card carrying both would have padding and type from one size and a box
   * from another.
   *
   * **Large print always takes this path**, because its face is fractions of the
   * card rather than a `text-…` per rung — one more table of five classes would
   * be a second ladder to keep in step with the first two. The number it starts
   * from is the rung's own pixel height times the same scale the root font size
   * moved by, so a large-print `sm` card and a large-print `CardBack` at `sm`,
   * which is still drawn with the rem classes, come out the same size to the
   * pixel.
   */
  const drawnHeight = height ?? (large ? CARD_HEIGHT_PX[size] * scale : undefined);
  const sized: CSSProperties | undefined = drawnHeight
    ? {
        height: drawnHeight,
        width: cardWidthAt(drawnHeight),
        fontSize: drawnHeight * shape.text,
        padding: drawnHeight * shape.pad,
        borderRadius: drawnHeight * shape.radius,
      }
    : undefined;

  return (
    <Tag
      ref={anchor}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      style={sized}
      aria-label={`${card.rank} of ${SUIT_LABEL[card.suit]}`}
      className={[
        drawnHeight ? "" : SIZES[size],
        arriving ? "invisible" : "",
        // Belt to the layout's braces: a rank like 10 at a large text size must never
        // spill past the card's edge.
        "relative flex shrink-0 flex-col items-start overflow-hidden bg-white font-semibold leading-none shadow-lg",
        // Large print's one index sits in the middle of the card's height, at the
        // left edge like every other face here. See below for why not centred.
        large ? "justify-center" : "",
        "ring-1 ring-black/10 transition-transform duration-150",
        // Dimmed, never translucent (#331). The hand fans with a step well under a
        // card's width, so 25–41px of every card is overlapped by the next one —
        // and at 45% opacity you read straight through each card to the edges and
        // ranks behind it. Worst exactly where it was reported: a lot of cards
        // and none playable, so there is no opaque card left to read the stack
        // against. A filter takes the ink down and leaves the card opaque.
        dimmed ? "brightness-75 saturate-50" : "",
        selected ? "z-20 -translate-y-3 ring-2 ring-amber-400" : "",
        onClick ? "cursor-pointer hover:-translate-y-2 focus-visible:-translate-y-2" : "",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        colour,
      ].join(" ")}
    >
      {large ? (
        /* One rank and its suit, and nothing else (#323). No ghost pip, and **no
           mirrored second index either** — that is #130's argument one step
           further on. The second index exists so the far side of an IRL table can
           read your phone; at 0.42 of the card it would have to come out of the
           first one, and a single rank nearly twice the size is more legible
           across a table upside down than two small ones are the right way up.

           **At the left edge, not centred**, which is where #323's proposal was
           wrong and the app's oldest layout rule is right. Cards fan: the seat
           strip overlaps them to fit a table on a phone (#59) and your own hand
           closes up before it scrolls (#117), and what a fanned card leaves
           showing is a sliver of its **left edge**. A centred rank is drawn in
           the half of the card the next card is covering, so at the strip's floor
           it was blank white — measured on a four-seat table, which is the widest
           the strip ever is. Vertically it does sit in the middle: nothing else
           is competing for the height, and it reads as placed rather than as an
           index that lost its card.

           `readableSliver` is the floor that follows from this, and it is why
           large print scrolls sooner than the ordinary face does. */
        <span className="leading-[1.05]">
          {card.rank}
          <span className="block text-[0.85em]">{glyph}</span>
        </span>
      ) : (
        <>
          <span className="leading-[1.05]">
            {card.rank}
            <span className="block text-[0.85em]">{glyph}</span>
          </span>
          {/* The big pip sits in whatever room is left rather than claiming its own
              row, so the face can't grow taller than the card. Not drawn on a
              mirrored card at all (#130): that corner holds the second index, so at
              an IRL table it is decoration under an upside-down rank. */}
          {mirrored ? (
            <span className="absolute bottom-[0.25em] right-[0.25em] rotate-180 text-right leading-[1.05]">
              {card.rank}
              <span className="block text-[0.85em]">{glyph}</span>
            </span>
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 right-0 translate-x-[15%] translate-y-[18%] text-[2.6em] opacity-25"
            >
              {glyph}
            </span>
          )}
        </>
      )}
    </Tag>
  );
}

/** The back of a card: someone else's hand, or the draw pile.
 *
 * It stays on the rem classes in large print, where `PlayingCard` switches to
 * pixels — the two agree because every rung in `SIZES` is its pixel pair divided
 * by 16 and large print moves the root font size by the same scale (#323). */
export function CardBack({
  size = "md",
  className = "",
  anchor,
}: {
  size?: CardSize;
  className?: string;
  anchor?: RefCallback<HTMLElement>;
}) {
  return (
    <div
      ref={anchor}
      aria-hidden
      className={[
        SIZES[size],
        "bee-back shrink-0 shadow-lg ring-1 ring-white/10",
        className,
      ].join(" ")}
    />
  );
}

/**
 * A suit, as a mark rather than a word. It used to be the glyph *and* the name
 * inside a 48px circle — 75px of text across, multiplied by whatever the shared
 * screen was scaling the piles by, so about fifty pixels of it lay unbacked
 * across the card in play (#159). The name is kept for whoever is listening.
 */
export function SuitMark({
  mark,
  className = "",
  style,
}: {
  mark: PileSuit;
  className?: string;
  /** The shared screen turns this to face whoever is playing (#160). */
  style?: CSSProperties;
}) {
  return (
    <span
      style={style}
      className={[
        "font-semibold",
        mark.kind === "owed"
          ? "text-white/45"
          : isRed(mark.suit)
            ? "text-rose-300"
            : "text-slate-100",
        className,
      ].join(" ")}
    >
      <span aria-hidden>{mark.kind === "owed" ? "?" : SUIT_GLYPH[mark.suit]}</span>
      <span className="sr-only">
        {mark.kind === "owed" ? "a suit is being named" : `${SUIT_LABEL[mark.suit]} called`}
      </span>
    </span>
  );
}
