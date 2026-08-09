import type { RefCallback } from "react";

import type { Card as CardModel, Suit } from "@goleta/engine";

export const SUIT_GLYPH: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
export const SUIT_LABEL: Record<Suit, string> = {
  C: "clubs",
  D: "diamonds",
  H: "hearts",
  S: "spades",
};

export const isRed = (suit: Suit): boolean => suit === "D" || suit === "H";

/**
 * `xl` exists for one screen: a phone in landscape at an IRL table, where your
 * own hand is the entire point of the display and there is finally the height
 * to draw it properly (#78). Nothing else uses it and nothing else should — on
 * any layout that has a seat strip to fit as well, it is simply too big.
 */
export type CardSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<CardSize, string> = {
  sm: "h-14 w-10 text-sm rounded-md p-1",
  md: "h-24 w-[4.25rem] text-xl rounded-lg p-1.5",
  lg: "h-32 w-24 text-2xl rounded-xl p-2",
  xl: "h-44 w-33 text-4xl rounded-2xl p-2.5",
};

/**
 * The widths above, in pixels at the default root font size. Two things read
 * them: the *ratio* between a pair, to size a card in flight against the one it
 * is flying towards, and the arithmetic in `handFan.ts`. A browser zoom or a
 * bigger root font skews neither — the first is a ratio, and the second is
 * fitted against a width that was measured at the same zoom. Keep them in step
 * with `SIZES` anyway.
 */
export const CARD_WIDTH_PX: Record<CardSize, number> = { sm: 40, md: 68, lg: 96, xl: 132 };

interface CardProps {
  card: CardModel;
  size?: CardSize;
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

  return (
    <Tag
      ref={anchor}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      aria-label={`${card.rank} of ${SUIT_LABEL[card.suit]}`}
      className={[
        SIZES[size],
        arriving ? "invisible" : "",
        // `overflow-hidden` is the belt to the layout's braces: a rank like 10
        // at a large text size must never spill past the card's edge.
        "relative flex shrink-0 flex-col items-start overflow-hidden bg-white font-semibold leading-none shadow-lg",
        "ring-1 ring-black/10 transition-transform duration-150",
        dimmed ? "opacity-45 saturate-50" : "",
        selected ? "-translate-y-3 ring-2 ring-amber-400" : "",
        onClick ? "cursor-pointer hover:-translate-y-2 focus-visible:-translate-y-2" : "",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        colour,
      ].join(" ")}
    >
      <span className="leading-[1.05]">
        {card.rank}
        <span className="block text-[0.85em]">{glyph}</span>
      </span>
      {/* The big pip sits in whatever room is left rather than claiming its
          own row, so the face can't grow taller than the card. */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 translate-x-[15%] translate-y-[18%] text-[2.6em] opacity-25"
      >
        {glyph}
      </span>
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

export function SuitBadge({ suit, className = "" }: { suit: Suit; className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-sm font-semibold",
        isRed(suit) ? "text-rose-300" : "text-slate-100",
        className,
      ].join(" ")}
    >
      <span aria-hidden>{SUIT_GLYPH[suit]}</span>
      <span className="capitalize">{SUIT_LABEL[suit]}</span>
    </span>
  );
}
