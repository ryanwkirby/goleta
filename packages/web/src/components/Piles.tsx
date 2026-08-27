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
 *
 * **Which column the deck is in is the caller's** (#259). The upright phone puts
 * it on the right, under the thumb that taps; the shared table screen must not
 * move, because that board is read from four sides by people who never touch it
 * and there is no right hand on a screen lying flat.
 */

import type { Card, GameView, SunnyEvidence } from "@goleta/engine";

import { pileSuit } from "../lib/pile.ts";
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

export function Piles({
  game,
  canDraw,
  onDraw,
  peel = null,
  irl = false,
  size = "lg",
  turn = 0,
  deckSide = "left",
}: {
  game: GameView;
  canDraw: boolean;
  onDraw: () => void;
  peel?: Peel | null;
  irl?: boolean;
  size?: Extract<CardSize, "lg" | "xl">;
  /**
   * Which side the deck sits on. `left` for the shared screen, which is one
   * design read from four sides and has no near hand; `right` for the upright
   * phone, where the deck is the only one of the two anybody touches and it was
   * under the hand holding the phone rather than the one tapping (#259).
   */
  deckSide?: "left" | "right";
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
  // named card over whichever column the deck is in, which is why it is handed
  // `deckSide` too. Nothing here moves or unmounts, so every anchor stays where
  // it was.
  // The fade is part of the wind-back rather than a state change under it, so it
  // takes the peel's own pace rather than a UI transition's (#356).
  const aside = peel ? "opacity-25 transition-opacity duration-700" : "transition-opacity";
  const pileBox = size === "xl" ? "h-44 w-33 rounded-2xl" : "h-32 w-24 rounded-xl";

  return (
    // Reversed rather than reordered: the deck stays first in the DOM, so it is
    // still the first thing a screen reader meets and still the first tab stop,
    // and only the picture changes. Anchors are measured off the box, so a
    // flight follows the column wherever it is drawn.
    <div
      className={[
        "flex items-center justify-center gap-6",
        deckSide === "right" ? "flex-row-reverse" : "",
      ].join(" ")}
    >
      <div className={["flex flex-col items-center", aside].join(" ")}>
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
      </div>

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
        {/* `size` goes down with it: the mark over the card in play has to be
            exactly the size the pile is drawn at, or the live top card shows
            around the edges of the evidence (#356). */}
        {peel ? <SunnyPeel {...peel} irl={irl} size={size} deckSide={deckSide} /> : null}
        {/* One badge, two things it can say, in the same place either way — so an
            answer arriving fills the mark in rather than putting a badge on the
            board out of nowhere. At the pile because that is where the decision
            is made.

            **It stands on its own** (#335). It was written as a pair with a
            caption underneath — *naming* / *showing* — on the reasoning that a
            mark with no word is a mark nobody can read. The word went: the badge
            is at the corner of the same card, and the prompt line already says
            "Ryan is naming a suit." in words. `SuitMark`'s `sr-only` text is
            what carries it to a screen reader. */}
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
    </div>
  );
}
