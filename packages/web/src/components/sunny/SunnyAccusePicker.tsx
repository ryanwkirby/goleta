/**
 * The offender's hand, offered as an accusation. **Five prohibitions converge on
 * this one panel, and holding four is not enough**; `AGENTS.md` is the
 * authority. Nothing says which card was legal, there is no helpful sort,
 * nothing is dimmed or disabled, nothing indicates whether a call would land
 * (#31 shipped that answer and #50 took it back out), and `sunnyReach` is
 * evidence rather than a verdict — do not add a `legalCardIds` for it.
 *
 * The first three are one idea from three directions: which card was legal is
 * exactly the question, so any weighting at all answers it.
 */

import { useRef, type CSSProperties } from "react";

import type { SunnyReach } from "@goleta/engine";

import { handStep, PICKER_TIGHTEST } from "../../lib/handFan.ts";
import { useBox } from "../../lib/measure.ts";
import { PlayingCard } from "../Card.tsx";
import { CARD_WIDTH_PX, SUIT_GLYPH } from "../../lib/cardShape.ts";
import { Button } from "../ui.tsx";

/**
 * Docked rather than modal, for the suit picker's reason and one of its own: the
 * cards listed are the offender's hand *as it was*, and comparing that against
 * the pile and what they hold now is the entire judgement being asked of you.
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
   * Landscape, where the whole viewport is about 350px tall (#78). **Compact
   * means docked, and a docked panel is paid for in card size**: `handHeight`
   * sizes the player's cards to what this leaves (#166), so a row added here
   * comes straight off their cards.
   *
   * The hand lays out in **one row, always**. A picker whose height came in
   * card-row steps had to be capped, and then both halves scrolled — two nested
   * scrolls, at the one moment nothing may be cut off. The overlap is a layout
   * and not a hint: every card leaves the same sliver (#96).
   */
  compact?: boolean;
  irl?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const { width } = useBox(row);
  // Only the compact row fans. The full table's picker has the width to wrap.
  const step = handStep(width, reach.hand.length, CARD_WIDTH_PX.sm, PICKER_TIGHTEST);

  return (
    <section
      aria-label={`Name the card ${targetName} should have played`}
      className={[
        "z-20 rounded-2xl bg-felt-900/95 shadow-xl ring-1 ring-amber-300/40 backdrop-blur",
        compact ? "p-2" : "sticky bottom-2 p-3",
      ].join(" ")}
    >
      {/* **The heading wraps rather than truncating** (#294). `truncate` ate the
          tail, and the tail is where the name is — so against a longer one the
          question came out as "What should Clockwork have p…", a sentence about
          nobody. The name is the one word in it carrying information: everything
          else is the same every time.

          The worry about wrapping is that a docked picker is paid for in card
          size (#166), and measured, it isn't. This row is already 36px tall
          because `never mind` is a `Button` and carries `min-h-11`, so a second
          line of a 20px heading overshoots it by eleven pixels rather than by a
          row — and it only ever happens **upright**, where the hand is on the
          fixed ladder (#191) and pays nothing at all. The compact picker spans a
          landscape phone: at the narrowest one, with the worst insets, that
          leaves the heading about 340px, and the longest sentence a room can
          produce measures 278 (`NAME_LIMIT` is 10). It does not wrap there. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-amber-300">
          <span aria-hidden>☀️</span> What should {targetName} have played?
        </h2>
        <Button variant="ghost" className="-my-1 shrink-0 px-2 py-1 text-xs" onClick={onCancel}>
          never mind
        </Button>
      </div>
      {/* The row of cards is the offender's hand as it stood at the reach, and
          saying so described it rather than asking anything of the person
          reading it. The question is what they are here to answer (#305). It
          still says nothing about which of the cards was legal. */}
      <p className={["text-xs text-white/50", compact ? "mt-0.5" : "mt-1"].join(" ")}>
        {compact
          ? "Which of these cards was playable?"
          : "Which of these cards was playable? Get it wrong and you can't call again for three reaches."}
      </p>
      {/* One row when docked over a hand, wrapped when not. The row keeps no
          padding of its own: its width *is* the width the fan was fitted to. */}
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
