import type { GameView } from "@goleta/engine";

import { DECK, PILE } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import { CardBack, PlayingCard, SuitBadge } from "./Card.tsx";

/**
 * A word under a pile, or the room one would take.
 *
 * The captions come and go — `showing` only exists while a suit is called —
 * and the row is `items-center`, so a caption appearing under one column would
 * shove that column's card upwards. The space is held whether or not there's
 * anything to say, the same way `Table.tsx` holds a row above your hand.
 */
function Caption({ children }: { children?: string }) {
  return <span className="h-4 text-xs leading-4 text-white/40">{children}</span>;
}

export function Piles({
  game,
  canDraw,
  onDraw,
}: {
  game: GameView;
  canDraw: boolean;
  onDraw: () => void;
}) {
  const { anchor, pileFace } = useMotion();
  // The state's top card is the one that has *finished* arriving. While a card
  // is still on its way here the pile keeps showing the card it is landing on,
  // and shows nothing at all through a deal, until the upcard drops.
  const face = pileFace(game.topCard);
  const shown = face ?? game.topCard;
  // The named suit only needs saying when it isn't the one you can see.
  const suitOverridden = game.activeSuit !== shown.suit;
  const cardsLeft = game.drawPileSize;

  return (
    <div className="flex items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-1.5">
        {/*
          Tappable whenever it's your turn, including when you're holding a
          playable card. Drawing then breaks the rules, and letting you do it
          without a word of warning is the entire point of the Sunny Rule. No
          disabled state, no confirmation — see AGENTS.md.
        */}
        <button
          type="button"
          onClick={onDraw}
          disabled={!canDraw}
          // The label overrides everything inside the button, so the count has
          // to be part of it or it is never announced at all.
          aria-label={`Draw a card — ${cardsLeft} left`}
          className={[
            "relative rounded-lg transition-transform",
            canDraw
              ? "cursor-pointer hover:-translate-y-1 focus-visible:-translate-y-1"
              : "cursor-not-allowed opacity-60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
          ].join(" ")}
        >
          <CardBack size="lg" anchor={anchor(DECK)} />
          {/* Sat on the lattice rather than on a flat colour now, so it brings
              its own dark to stand on. */}
          <span aria-hidden className="absolute inset-x-0 bottom-2 flex justify-center">
            <span className="rounded-full bg-black/55 px-2 py-1 font-mono text-xs leading-none text-white/85">
              {cardsLeft} {cardsLeft === 1 ? "card" : "cards"}
            </span>
          </span>
        </button>
        {/* No `draw` caption: the button says so where it counts, and the pile
            of face-down cards was never the ambiguous half of this row. */}
        <Caption />
      </div>

      <div className="flex flex-col items-center gap-1.5">
        {face ? (
          <PlayingCard card={face} size="lg" anchor={anchor(PILE)} />
        ) : (
          <div
            ref={anchor(PILE)}
            aria-hidden
            className="h-32 w-24 rounded-xl border border-dashed border-white/15"
          />
        )}
        {/* `showing` earns its place — paired with `called` under the badge it
            is what explains that the card you can see is not the suit in play.
            The count of cards already played explained nothing. */}
        <Caption>{suitOverridden ? "showing" : undefined}</Caption>
      </div>

      {suitOverridden ? (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex h-32 items-center">
            <SuitBadge suit={game.activeSuit} className="text-base" />
          </div>
          <Caption>called</Caption>
        </div>
      ) : null}
    </div>
  );
}
