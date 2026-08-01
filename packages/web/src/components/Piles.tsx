import type { GameView } from "@goleta/engine";

import { DECK, PILE } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import { CardBack, PlayingCard, SuitBadge } from "./Card.tsx";

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
          aria-label="Draw a card"
          className={[
            "relative rounded-lg transition-transform",
            canDraw
              ? "cursor-pointer hover:-translate-y-1 focus-visible:-translate-y-1"
              : "cursor-not-allowed opacity-60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
          ].join(" ")}
        >
          <CardBack size="lg" anchor={anchor(DECK)} />
          <span className="absolute inset-x-0 bottom-2 text-center font-mono text-sm text-white/70">
            {game.drawPileSize}
          </span>
        </button>
        <span className="text-xs text-white/40">draw</span>
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
        <span className="text-xs text-white/40">
          {suitOverridden ? "showing" : `${game.discardPileSize} played`}
        </span>
      </div>

      {suitOverridden ? (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex h-32 items-center">
            <SuitBadge suit={game.activeSuit} className="text-base" />
          </div>
          <span className="text-xs text-white/40">called</span>
        </div>
      ) : null}
    </div>
  );
}
