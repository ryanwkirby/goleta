import { useRef, type CSSProperties } from "react";

import type { SunnyReach } from "@goleta/engine";

import { handStep, PICKER_TIGHTEST } from "../../lib/handFan.ts";
import { useBox } from "../../lib/measure.ts";
import { PlayingCard } from "../Card.tsx";
import { CARD_WIDTH_PX, SUIT_GLYPH } from "../../lib/cardShape.ts";
import { Button } from "../ui.tsx";

/**
 * Naming the card, which is what a Sunny call now is.
 *
 * Docked rather than modal, for the same reason the suit picker is: the whole
 * table is face up because you are meant to be reading it, and a scrim over the
 * evidence at the exact moment you need it was the wrong trade. This one has a
 * second reason too — the cards it lists are the offender's hand *as it was*,
 * and being able to compare that against the pile and against what they hold
 * now, without anything covered, is the entire judgement being asked of you.
 *
 * Deliberately unhelpful: every card is offered at equal weight. Which of them
 * was legal is exactly the question, and dimming the ones that weren't would
 * answer it.
 */
export function SunnyAccusePicker({
  targetName,
  reach,
  onPick,
  onCancel,
  compact = false,
  irl = false,
}: {
  targetName: string;
  reach: SunnyReach;
  onPick: (cardId: string) => void;
  onCancel: () => void;
  /**
   * Landscape, where the whole viewport is about 350px tall (#78).
   *
   * The cards drop a size, the second line of explanation goes, and the hand
   * lays out in **one row, always** — whole cards with air between them while
   * they fit, closing up onto each other once they don't, the same trade
   * `fan.ts` and `handFan.ts` make everywhere else. A picker whose height came
   * in card-row steps had to be capped at a fraction of the column, and then
   * both halves of that column were short: the picker scrolled inside its cap
   * and the hand underneath, which cannot be drawn smaller than a card, scrolled
   * its own overflow with cards clipped top and bottom. Two nested scrolls, at
   * the one moment nothing may be covered or cut off.
   *
   * Nothing about *which* cards are offered changes: it is still the whole
   * pre-draw hand, still at equal weight, still unsorted and undimmed. The
   * overlap is a layout and not a hint — every card in the row leaves the same
   * sliver, so it says nothing about which of them was legal.
   */
  compact?: boolean;
  irl?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const { width } = useBox(row);
  // Only the compact row fans. The full table's picker has the width to wrap
  // and the height to wrap into.
  const step = handStep(width, reach.hand.length, CARD_WIDTH_PX.sm, PICKER_TIGHTEST);

  return (
    <section
      aria-label={`Name the card ${targetName} should have played`}
      className={[
        "z-20 rounded-2xl bg-felt-900/95 shadow-xl ring-1 ring-amber-300/40 backdrop-blur",
        compact ? "p-2" : "sticky bottom-2 p-3",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-amber-300">
          <span aria-hidden>☀️</span> What should {targetName} have played?
        </h2>
        <Button variant="ghost" className="-my-1 shrink-0 px-2 py-1 text-xs" onClick={onCancel}>
          never mind
        </Button>
      </div>
      <p className={["text-xs text-white/50", compact ? "mt-0.5" : "mt-1"].join(" ")}>
        {compact
          ? "Their hand as it was when they reached."
          : "Their hand as it was when they reached. Get it wrong and you can't call again for three draws."}
      </p>
      {/* One row when it is docked over a hand, wrapped when it isn't. The row
          keeps no padding of its own: its width *is* the width the fan was
          fitted to, and an inset here and an inset in the arithmetic are two
          places to disagree. */}
      <div
        ref={row}
        style={
          compact
            ? ({ "--fan": `${step - CARD_WIDTH_PX["sm"]}px` } as CSSProperties)
            : undefined
        }
        className={[
          "flex",
          compact ? "mt-1.5 overflow-x-auto [&>*+*]:ml-[var(--fan)]" : "mt-2 flex-wrap gap-2",
        ].join(" ")}
      >
        {reach.hand.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            size={compact ? "sm" : "md"}
            mirrored={irl}
            onClick={() => onPick(card.id)}
            title={`Accuse them of skipping the ${card.rank}${SUIT_GLYPH[card.suit]}`}
          />
        ))}
      </div>
    </section>
  );
}
