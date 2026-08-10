import type { Card, GameView, SunnyEvidence } from "@goleta/engine";

import { calledSuit } from "../lib/pile.ts";
import { DECK, PILE } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import { CardBack, PlayingCard, SuitBadge, type CardSize } from "./Card.tsx";
import { SunnyPeel } from "./Sunny.tsx";

/**
 * A judged Sunny call, being shown its working at the pile. Null the rest of
 * the time, which is nearly always.
 */
export interface Peel {
  evidence: SunnyEvidence;
  named: Card;
  callerName: string;
  targetName: string;
}

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
  peel = null,
  irl = false,
  size = "lg",
}: {
  game: GameView;
  canDraw: boolean;
  onDraw: () => void;
  peel?: Peel | null;
  irl?: boolean;
  size?: Extract<CardSize, "lg" | "xl">;
}) {
  const { anchor, pileFace } = useMotion();
  // The state's top card is the one that has *finished* arriving. While a card
  // is still on its way here the pile keeps showing the card it is landing on,
  // and shows nothing at all through a deal, until the upcard drops.
  const face = pileFace(game.topCard);
  // Said whenever somebody has actually named one for the card that is up —
  // including when they named the suit already printed on it, which is a play
  // and not a no-op. That condition lives in `calledSuit`; the peek strip asks
  // it the same question.
  const called = calledSuit(game, face);
  const cardsLeft = game.drawPileSize;

  // Everything that isn't the evidence steps back while the peel is up. It also
  // keeps the fan legible where it overhangs the deck or the called suit —
  // nothing here moves or unmounts, so every anchor stays exactly where it was.
  const aside = peel ? "opacity-25 transition-opacity duration-300" : "transition-opacity";
  const pileBox = size === "xl" ? "h-44 w-33 rounded-2xl" : "h-32 w-24 rounded-xl";
  const suitBox = size === "xl" ? "h-44" : "h-32";

  return (
    <div className="flex items-center justify-center gap-6">
      <div className={["flex flex-col items-center gap-1.5", aside].join(" ")}>
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
          <CardBack size={size} anchor={anchor(DECK)} />
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
        <div className="relative">
          {face ? (
            <PlayingCard card={face} size={size} anchor={anchor(PILE)} mirrored={irl} />
          ) : (
            <div
              ref={anchor(PILE)}
              aria-hidden
              className={[pileBox, "border border-dashed border-white/15"].join(" ")}
            />
          )}
          {peel ? <SunnyPeel {...peel} irl={irl} /> : null}
          {called && !peel ? (
            <div className="absolute -bottom-3 -right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-felt-900 shadow-xl ring-2 ring-white/10">
              <SuitBadge suit={called} className="text-2xl" />
            </div>
          ) : null}
        </div>
        <Caption>{called && !peel ? "showing" : undefined}</Caption>
      </div>
    </div>
  );
}
