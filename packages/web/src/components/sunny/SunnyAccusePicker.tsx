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
 *
 * **The board the call is judged against is a sixth thing it does not show, and
 * that is a reversal** (#318). #220 argued the board was the question being
 * asked properly and #310 drew it; a call is meant to be paid for out of memory
 * instead, the way it is at a table where the card in play at the reach is
 * buried under everything that has landed on it since. The panel still says
 * nothing about which of the cards below was legal — what has gone is the half
 * of the question the app was answering on the caller's behalf.
 *
 * `ReachBoard` is switched off rather than deleted; see `SHOW_REACH_BOARD`.
 */

import { useRef, type CSSProperties } from "react";

import type { SunnyReach } from "@goleta/engine";

import { handStep, PICKER_TIGHTEST } from "../../lib/handFan.ts";
import { useBox } from "../../lib/measure.ts";
import { PlayingCard } from "../Card.tsx";
import { cardWidthPx, isRed, SUIT_GLYPH, SUIT_LABEL } from "../../lib/cardShape.ts";
import { usePrintScale } from "../../lib/largePrint.ts";
import { Button } from "../ui.tsx";

/**
 * Whether the picker draws the board a call is judged against. **Off since
 * #318**, and the switch exists so that turning it back on is a one-line
 * decision made against the argument below rather than a component rebuilt from
 * the wire fields.
 *
 * The board is on the wire either way — `sunnyReach` has carried `activeSuit`
 * and `topRank` since #74, `redact.ts` gates them on being able to call, and
 * `sunnyCalled.evidence` reads the same facts to the whole table once a call has
 * been judged. Nothing about the protocol depends on this.
 *
 * It is a constant rather than a prop or a house rule on purpose: this is one
 * decision about what a call costs, taken for every table, and threading it
 * through two layouts would suggest a room could differ on it.
 */
const SHOW_REACH_BOARD: boolean = false;

/**
 * The board the call will be judged against: the suit that had to be matched at
 * the reach, and the rank that was in play then.
 *
 * **The other half of `SunnyReach`, and it was drawn nowhere at all** (#220).
 * The picker listed `reach.hand` and left the board to be read off the pile —
 * and the pile is very often no longer the board a call is judged against,
 * because the challenge window deliberately outlives the turn: it shuts on the
 * *next* player's first action, so the offender routinely draws and then plays
 * before anybody calls. An 8 makes it worse than a coin flip, since naming a
 * suit is exactly the play that leaves the board maximally unlike the board
 * before it. So a player who read the table correctly was punished for it: they
 * named the card that matched the pile in front of them, and took the lockout
 * while the offender walked.
 *
 * **Two chips rather than one card, and this is the constraint to hold.**
 * `topRank` and `activeSuit` are not a card and must not be drawn as one: after
 * an 8 they are the 8's rank and somebody else's suit, so a single `8♣` would
 * put a card on this panel that nobody has played and that the pile is not
 * showing. They are two facts, so they are two marks with the word between them.
 * `sunnyReach` carries no `Card` to draw instead, and it must not grow one — the
 * issue is explicit that `GameView` gains nothing here.
 *
 * It says what the board was and stops. It does not say which of the cards below
 * answered it, does not mark, sort, dim or count them, and says nothing about
 * whether a call would land — nothing on the client knows that, and nothing ever
 * will (#50). **Wilds go unmentioned for the same reason**: "or any 8" is true,
 * harmless-looking, and points straight at cards in the hand this panel is
 * deliberately silent about.
 *
 * **Nothing renders this today** (#318). Everything above it is the argument for
 * drawing it at all and everything in this paragraph is the argument for the
 * shape it takes, and both are kept whole: the second is the expensive one to
 * re-derive, and a future table that wants the board back wants it as two chips
 * rather than as a card that was never played.
 */
function ReachBoard({
  reach,
  compact = false,
  className = "",
}: {
  reach: SunnyReach;
  /** Landscape, where this shares a line with the question rather than taking one. */
  compact?: boolean;
  className?: string;
}) {
  // `CardChip`'s own shape, which is how the caught dialog names a card: white,
  // in the suit's colour. This is a board, so it is drawn in the register of the
  // cards it is about rather than as another line of small print. The rank stays
  // dark whatever the suit is — it is a rank, and colouring it would print a
  // card that was never played.
  const chip = "rounded bg-white px-1 py-px font-semibold tabular-nums";

  return (
    <div
      className={[
        // `inline-flex` so it hugs its own contents wherever it is put: upright it
        // goes into the panel's block flow, where a full flex box would stretch to
        // the width and read as a band rather than as a mark.
        "inline-flex shrink-0 items-center rounded-lg bg-black/30 ring-1 ring-white/10",
        compact ? "gap-1.5 px-1.5 py-0.5" : "gap-2 px-2 py-1",
        className,
      ].join(" ")}
    >
      <span className="text-[0.6rem] font-semibold uppercase leading-none tracking-wider text-amber-300">
        had to match
      </span>
      <span
        aria-hidden
        className={["flex items-center gap-1 leading-none", compact ? "text-xs" : "text-sm"].join(
          " ",
        )}
      >
        <span
          className={[chip, isRed(reach.activeSuit) ? "text-rose-600" : "text-slate-900"].join(" ")}
        >
          {SUIT_GLYPH[reach.activeSuit]}
        </span>
        <span className="text-[0.65rem] font-medium uppercase tracking-wide text-white/40">or</span>
        <span className={[chip, "text-slate-900"].join(" ")}>{reach.topRank}</span>
      </span>
      <span className="sr-only">
        When they reached, they had to match {SUIT_LABEL[reach.activeSuit].toLowerCase()}, or the{" "}
        {reach.topRank} that was in play.
      </span>
    </div>
  );
}

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
  // In large print a bigger picker takes more, and the hand under it gives back
  // exactly that much — `handHeight` returns the room the row is left (#166, #323).
  // `PICKER_TIGHTEST` does not scale: it is a tap floor.
  const scale = usePrintScale();
  const step = handStep(
    width,
    reach.hand.length,
    cardWidthPx("sm", scale),
    PICKER_TIGHTEST,
    false,
    scale,
  );

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
          still says nothing about which of the cards was legal.

          The board those cards are judged against would go **last before the
          hand**, because it is the thing being read against it (#220) — and it
          is not drawn at all now that the caller supplies it from memory (#318).
          The placement and the two layouts are kept because `SHOW_REACH_BOARD`
          is a switch rather than a demolition: where it goes is settled, and
          re-settling it is the part that costs.

          Landscape put the two on one line rather than taking a second. The
          picker's height is exactly what the hand below steps down by (#166), so
          a row added here comes straight off the player's cards — and the board
          was a label and two marks beside a question with width to spare, so the
          compact view bought the whole of it for no cards at all. The question
          is the half that gives, because it is the same sentence every time and
          the board is the half carrying information; that is #294's rule about
          which end of a line may be cut, applied to a different line. */}
      {compact ? (
        <div className="mt-0.5 flex items-center gap-2">
          {SHOW_REACH_BOARD ? <ReachBoard reach={reach} compact /> : null}
          <p className="min-w-0 truncate text-xs text-white/50">
            Which of these cards was playable?
          </p>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs text-white/50">
            Which of these cards was playable? Get it wrong and you can't call again for three
            reaches.
          </p>
          {SHOW_REACH_BOARD ? <ReachBoard reach={reach} className="mt-2" /> : null}
        </>
      )}
      {/* One row when docked over a hand, wrapped when not. The row keeps no
          padding of its own: its width *is* the width the fan was fitted to. */}
      <div
        ref={row}
        style={
          compact
            ? ({ "--fan": `${step - cardWidthPx("sm", scale)}px` } as CSSProperties)
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
