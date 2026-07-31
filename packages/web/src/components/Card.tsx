import type { Card as CardModel, Suit } from "@goleta/engine";

export const SUIT_GLYPH: Record<Suit, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
export const SUIT_LABEL: Record<Suit, string> = {
  C: "clubs",
  D: "diamonds",
  H: "hearts",
  S: "spades",
};

export const isRed = (suit: Suit): boolean => suit === "D" || suit === "H";

export type CardSize = "sm" | "md" | "lg";

const SIZES: Record<CardSize, string> = {
  sm: "h-14 w-10 text-sm rounded-md p-1",
  md: "h-24 w-[4.25rem] text-xl rounded-lg p-1.5",
  lg: "h-32 w-24 text-2xl rounded-xl p-2",
};

interface CardProps {
  card: CardModel;
  size?: CardSize;
  /** Dimmed but still legible: you can see it, you just can't play it. */
  dimmed?: boolean;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
}

export function PlayingCard({
  card,
  size = "md",
  dimmed = false,
  selected = false,
  onClick,
  title,
}: CardProps) {
  const glyph = SUIT_GLYPH[card.suit];
  const colour = isRed(card.suit) ? "text-rose-600" : "text-slate-900";
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      aria-label={`${card.rank} of ${SUIT_LABEL[card.suit]}`}
      className={[
        SIZES[size],
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
export function CardBack({ size = "md", className = "" }: { size?: CardSize; className?: string }) {
  return (
    <div
      aria-hidden
      className={[
        SIZES[size],
        "shrink-0 bg-felt-800 shadow-lg ring-1 ring-white/10",
        "bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.07)_4px,rgba(255,255,255,0.07)_8px)]",
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
