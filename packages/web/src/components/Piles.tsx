/**
 * The draw pile and the card in play — and the one control in this app that is
 * deliberately unsafe. **Rules converge here**; `AGENTS.md` § "Rules that look
 * like bugs and are not" is the authority.
 *
 * - **The draw pile stays tappable while you hold a legal play, with no
 *   warning.** No disabled state, no confirmation, no hint. That violation is
 *   what the Sunny Rule exists to punish, so the UI has to permit it silently.
 * - **Nothing here says whether a call would land** (#50), and the peel runs
 *   identically for a wrong call and a right one (#63).
 * - **The badge names a suit only when somebody chose one** (#76, #150).
 * - **A five-second reshuffle gates nothing**, least of all this pile (#209).
 */

import type { Card, GameView, SunnyEvidence } from "@goleta/engine";

import { pileSuit, type PileSuit } from "../lib/pile.ts";
import { DECK, PILE } from "../lib/anchors.ts";
import { useMotion } from "../lib/motion.ts";
import { CardBack, PlayingCard, SuitMark } from "./Card.tsx";
import type { CardSize } from "../lib/cardShape.ts";
import { SunnyPeel } from "./sunny/SunnyPeel.tsx";

/** A judged Sunny call, being shown its working at the pile. */
export interface Peel {
  evidence: SunnyEvidence;
  named: Card;
  callerName: string;
  targetName: string;
}

/**
 * A word under a pile, or the room one would take. The captions come and go and
 * the row is `items-center`, so one appearing would shove its column's card
 * upwards; the space is held whether or not there is anything to say.
 */
function Caption({ children }: { children?: string }) {
  return <span className="h-4 text-xs leading-4 text-white/40">{children}</span>;
}

/** Written as a pair so the two cannot drift: a caption with no badge is a stray
 * word, and a badge with no caption is a mark nobody can read (#76). */
const CAPTION: Record<PileSuit["kind"], string> = { owed: "naming", named: "showing" };

export function Piles({
  game,
  canDraw,
  onDraw,
  peel = null,
  irl = false,
  size = "lg",
  turn = 0,
}: {
  game: GameView;
  canDraw: boolean;
  onDraw: () => void;
  peel?: Peel | null;
  irl?: boolean;
  size?: Extract<CardSize, "lg" | "xl">;
  /**
   * How far to turn the two bits of *writing* on these piles, so they read from
   * wherever the shared screen is facing (#160). Zero on every phone. The cards
   * themselves never turn — `mirrored` is what makes those readable from both
   * ends, and turning a card would be turning the board.
   */
  turn?: number;
}) {
  const { anchor, pileFace } = useMotion();
  // The state's top card is the one that has *finished* arriving; while a card is
  // still on its way the pile keeps showing the card it is landing on.
  const face = pileFace(game.topCard);
  // Said whenever somebody has named one for the card that is up — including the
  // suit already printed on it, which is a play and not a no-op — and while one
  // is owed, which is a board about to be replaced and used to look exactly like
  // a settled one (#150).
  const suit = pileSuit(game, face);
  const cardsLeft = game.drawPileSize;

  // Everything that isn't the evidence steps back while the peel is up. It also
  // keeps the fan legible where it overhangs the deck: `SunnyPeel` hangs the
  // named card off the card in play at `right-full`, i.e. over whichever column
  // is to its left, so the peel's geometry depends on the deck being that one
  // (#259). Nothing here moves or unmounts, so every anchor stays where it was.
  const aside = peel ? "opacity-25 transition-opacity duration-300" : "transition-opacity";
  const pileBox = size === "xl" ? "h-44 w-33 rounded-2xl" : "h-32 w-24 rounded-xl";

  return (
    <div className="flex items-center justify-center gap-6">
      <div className={["flex flex-col items-center gap-1.5", aside].join(" ")}>
        {/* Tappable whenever it's your turn, playable card in hand or not. First
            rule in the header above, and the one most often "fixed". */}
        <button
          type="button"
          onClick={onDraw}
          disabled={!canDraw}
          // The label overrides everything inside the button, so the count has to be
          // part of it or it is never announced at all.
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
            <span
              style={{ transform: `rotate(${turn}deg)` }}
              className="rounded-full bg-black/55 px-2 py-1 font-mono text-xs leading-none text-white/85"
            >
              {cardsLeft} {cardsLeft === 1 ? "card" : "cards"}
            </span>
          </span>
        </button>
        {/* No `draw` caption: the button says so where it counts. */}
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
          {/* One badge, two things it can say, in the same place either way — so an
              answer arriving fills the mark in rather than putting a badge on the
              board out of nowhere. At the pile because that is where the decision
              is made. */}
          {suit && !peel ? (
            <div className="absolute -bottom-3 -right-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-felt-900 shadow-xl ring-2 ring-white/10">
              <SuitMark
                mark={suit}
                className="text-2xl"
                style={{ transform: `rotate(${turn}deg)` }}
              />
            </div>
          ) : null}
        </div>
        <Caption>{suit && !peel ? CAPTION[suit.kind] : undefined}</Caption>
      </div>
    </div>
  );
}
