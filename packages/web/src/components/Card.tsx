import type { CSSProperties, RefCallback } from "react";

import type { Card as CardModel } from "@goleta/engine";

// Type-only, so it is erased and there is no runtime dependency in either
// direction: `pile.ts` is the one place that decides whether a suit has been
// named or is merely owed, and the mark below is how that answer is drawn.
import type { PileSuit } from "../lib/pile.ts";
import {
  CARD_SHAPE,
  cardWidthAt,
  isRed,
  SUIT_GLYPH,
  SUIT_LABEL,
  type CardSize,
} from "../lib/cardShape.ts";

const SIZES: Record<CardSize, string> = {
  sm: "h-14 w-10 text-sm rounded-md p-1",
  md: "h-24 w-[4.25rem] text-xl rounded-lg p-1.5",
  lg: "h-32 w-24 text-2xl rounded-xl p-2",
  xl: "h-44 w-33 text-4xl rounded-2xl p-2.5",
  // 52px of rank, and the two indices still clear each other: each is 1.94×
  // its own font size once the suit under it is counted, so 101px apiece in a
  // card 240 tall with 12 of padding at the top and 13 under the mirrored one.
  "2xl": "h-60 w-45 text-[3.25rem] rounded-3xl p-3",
};


interface CardProps {
  card: CardModel;
  size?: CardSize;
  /**
   * Drawn at this height in pixels rather than at `size`. The landscape hand
   * sets it; nothing else should.
   */
  height?: number;
  /** In-person cards need to be readable from both sides of the table. */
  mirrored?: boolean;
  /** Dimmed but still legible: you can see it, you just can't play it. */
  dimmed?: boolean;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
  /**
   * The card is still flying to this spot. It keeps its place in the layout and
   * gives up only its ink, so nothing shifts when it lands.
   */
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

  // A height off the ladder replaces the rung's class outright rather than
  // overriding half of it: the four numbers below are what `SIZES` is, and a
  // card carrying both would be a card whose padding and type came from one
  // size and whose box came from another.
  const sized: CSSProperties | undefined = height
    ? {
        height,
        width: cardWidthAt(height),
        fontSize: height * CARD_SHAPE.text,
        padding: height * CARD_SHAPE.pad,
        borderRadius: height * CARD_SHAPE.radius,
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
        height ? "" : SIZES[size],
        arriving ? "invisible" : "",
        // `overflow-hidden` is the belt to the layout's braces: a rank like 10
        // at a large text size must never spill past the card's edge.
        "relative flex shrink-0 flex-col items-start overflow-hidden bg-white font-semibold leading-none shadow-lg",
        "ring-1 ring-black/10 transition-transform duration-150",
        dimmed ? "opacity-45 saturate-50" : "",
        selected ? "z-20 -translate-y-3 ring-2 ring-amber-400" : "",
        onClick ? "cursor-pointer hover:-translate-y-2 focus-visible:-translate-y-2" : "",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        colour,
      ].join(" ")}
    >
      <span className="leading-[1.05]">
        {card.rank}
        <span className="block text-[0.85em]">{glyph}</span>
      </span>
      {/* The big pip sits in whatever room is left rather than claiming its own
          row, so the face can't grow taller than the card.

          Not drawn on a mirrored card at all (#130). The corner it fades into
          is the corner the second index sits in, so at an IRL table it is a
          ghost suit under an upside-down rank — decoration in front of the one
          thing these cards exist to be read for. Online rooms keep it, because
          nothing is drawn over it there. */}
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
    </Tag>
  );
}

/** The back of a card: someone else's hand, or the draw pile. */
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
 * A suit, as a mark rather than a word.
 *
 * It used to be the glyph *and* the suit's name, and the pile drew it inside a
 * 48px circle: at `text-2xl` that measures 75px across, so fourteen pixels hung
 * out of each side with nothing behind them — multiplied by whatever the shared
 * table screen was scaling the piles by, which made it about fifty pixels of
 * unbacked text lying across the card in play (#159).
 *
 * The word was never carrying much. At the pile there is a caption under the
 * card saying whether a suit is being named or shown, and the peek strip has
 * always drawn the glyph alone. This is the same treatment in both places now,
 * with the name kept for whoever is listening rather than looking.
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
