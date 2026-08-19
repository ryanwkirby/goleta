import { useEffect, useRef, type CSSProperties } from "react";

import type { Card, SunnyEvidence, SunnyReach } from "@goleta/engine";

import { handStep, PICKER_TIGHTEST } from "../lib/handFan.ts";
import { useBox } from "../lib/measure.ts";
import { PlayingCard } from "./Card.tsx";
import {
  CARD_WIDTH_PX,
  isRed,
  SUIT_GLYPH,
  SUIT_LABEL,
  type CardSize,
} from "../lib/cardShape.ts";
import { Button } from "./ui.tsx";

/** A plain outline. It is furniture until it has something to say. */
function SunGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="h-full w-full"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.6M12 19v2.6M2.4 12h2.6M19 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </svg>
  );
}

/**
 * The way you start an accusation, and the most time-critical control here.
 *
 * It used to be a 20px circle wedged between somebody's name and their card
 * count, in a strip that scrolls sideways — half a thumb, aimed at by eye,
 * for the one thing in this app whose window closes when the next player takes
 * their first action. A missed tap was usually a missed call (#189). So: the
 * same sun, at the 44px everything here is designed to, somewhere a thumb can
 * find without aiming.
 *
 * **Leaving the seat is what makes it say who.** There is only ever one
 * `sunnyTargetId`, so the control can name them — *call it on Angela* — which
 * is more legible than a glyph beside a name in a scrolling strip ever was, and
 * it stops the call being a thing you do *to a name in a list*.
 *
 * One state, and that is the entire point. It appears when a draw is standing
 * and you are free to call, and it means only that: somebody reached for the
 * deck. Whether they were allowed to is on the table in front of you, in their
 * hand, and working it out is the game. Nothing here brightens, ramps or
 * otherwise leaks the answer, and a bigger sun must not become a brighter one
 * when a call would land — nothing on the client knows that and nothing ever
 * will (`AGENTS.md`, #50).
 *
 * **Tapping it opens the picker; it does not call.** An accusation names a
 * card, so the tap that starts one cannot be the tap that commits it — and
 * opening the picker also sends `composingCall`, which holds the bots (#73), so
 * the bigger target buys time twice over.
 *
 * `lockedDraws` is the one thing that changes its appearance, and it isn't
 * about the draw at all: it is your own missed call still being served. The
 * server sends it to nobody else, so a caller serving one looks exactly the
 * same on everybody else's screen.
 */
export function SunnyCall({
  targetName,
  lockedDraws = 0,
  onCall,
  className = "",
}: {
  targetName: string;
  lockedDraws?: number;
  onCall?: () => void;
  className?: string;
}) {
  const locked = lockedDraws > 0;
  const label = locked
    ? `Your last call missed — ${lockedDraws} more ${lockedDraws === 1 ? "draw" : "draws"} before you can call again`
    : `Call the Sunny Rule on ${targetName}`;

  return (
    <button
      type="button"
      onClick={locked ? undefined : onCall}
      disabled={locked}
      title={label}
      aria-label={label}
      className={[
        // `min-h-11` rather than a fixed height: 44px is a floor here, exactly
        // as it is in `handFan.ts`, and for the same reason.
        "flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3.5 py-2",
        "text-sm font-semibold shadow-lg ring-1 backdrop-blur-sm transition-colors",
        // Near-black with an amber edge, not a flood of amber: this is a thing
        // to notice, not a verdict, and the table's amber already means *the
        // game is waiting on you* at the edges of the screen (#190).
        locked
          ? "cursor-not-allowed bg-black/50 text-white/25 ring-white/10"
          : "bg-black/65 text-amber-200 ring-amber-300/50 hover:bg-black/80 hover:text-amber-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        className,
      ].join(" ")}
    >
      <span aria-hidden className="h-6 w-6 shrink-0">
        <SunGlyph />
      </span>
      <span className="whitespace-nowrap">call it on {targetName}</span>
    </button>
  );
}

/** A card said aloud, for the one caption a screen reader gets. */
const spoken = (card: Card): string => `${card.rank} of ${SUIT_LABEL[card.suit]}`;

/**
 * A card the evidence is pointing at: the table's usual amber ring, plus a word
 * for what it is.
 *
 * `lift` raises it clear of whatever it is sitting on, which is what pulls a
 * named card back out of the faded part of the pile when they have already
 * played it. The card in play doesn't take it — it is drawn over the pile's own
 * top card, and lifting it would show a second card's edge underneath.
 */
function Marked({
  card,
  label,
  size,
  lift = false,
  irl = false,
}: {
  card: Card;
  label: string;
  size: CardSize;
  lift?: boolean;
  irl?: boolean;
}) {
  return (
    <span
      className={[
        "relative inline-flex ring-2 ring-amber-400",
        size === "lg" ? "rounded-xl" : "rounded-lg",
        lift ? "-translate-y-3" : "",
      ].join(" ")}
    >
      <span
        className={[
          "absolute -top-4 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full",
          "bg-felt-950/90 px-1.5 text-[0.6rem] font-semibold uppercase tracking-wider text-amber-300",
        ].join(" ")}
      >
        {label}
      </span>
      <PlayingCard card={card} size={size} mirrored={irl} />
    </span>
  );
}

/**
 * The evidence, held up at the pile: what was actually in play when they
 * reached, and the card the caller says they should have played instead.
 *
 * The pile peels back to get there. Everything played on top of the offence
 * fans aside and drops to near-transparent, leaving the card that was in play
 * underneath — which is where the ruling was made, and where it can be read
 * rather than believed. It runs identically for a call that landed and a call
 * that missed: the difference the table is meant to see is whether the two
 * marked cards match, not which banner follows. (#63)
 *
 * Two cards are marked and no others. A wrong call names a card that was in a
 * hand full of other cards, and lighting up the one they *should* have named
 * would hand over the answer the ruling itself withholds — and make the next
 * call automatic. This shows what was claimed and what was on the table; it
 * does not grade the claim.
 *
 * Drawn absolutely, out of the pile card it sits on, so the row underneath
 * neither moves nor gives up its anchor: a card flying to the pile mid-peel
 * lands exactly where it always would, under the evidence. Nothing here reads
 * live state either — it is all off the event — so a bot playing on into the
 * peel can't pull the presentation out from under itself.
 */
export function SunnyPeel({
  evidence,
  named,
  callerName,
  targetName,
  irl = false,
}: {
  evidence: SunnyEvidence;
  /** The card the caller named. Marked wherever it now happens to be. */
  named: Card;
  callerName: string;
  targetName: string;
  irl?: boolean;
}) {
  const { inPlay, since, activeSuit } = evidence;
  // They may have gone on to play the very card they stand accused of holding.
  const buried = since.some((card) => card.id === named.id);
  const suitNote = activeSuit === inPlay.suit ? "" : `, with ${SUIT_LABEL[activeSuit]} called`;

  return (
    <>
      {/* The evidence in words, said before the ruling is, so a screen reader
          gets the two in the same order as the table. */}
      <p role="status" className="sr-only">
        {targetName} reached for the deck with the {spoken(inPlay)} in play{suitNote}.{" "}
        {callerName} says they should have played the {spoken(named)}.
      </p>

      {/* What was in play at the reach, over whatever is showing now. On a call
          that landed they are already the same card, which is what lets the
          peel hand off into the rewind without the pile jumping. */}
      <span aria-hidden className="pointer-events-none absolute left-0 top-0">
        <Marked card={inPlay} label="was in play" size="lg" irl={irl} />
      </span>

      {/* Played since the offence, fanned off the top — oldest first, so the
          last one out is the card that was showing a moment ago. They overlap
          to a sliver of rank and suit, the same trade the seat fans make, which
          is what keeps the fan inside a phone. The rules keep it short anyway:
          the window shuts on the next player's first action, so there is rarely
          more than one card up here and often none, in which case this is empty
          and the peel is a plain highlight of the pair. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-full top-1/2 z-10 -ml-10 flex -translate-y-1/2"
      >
        {since.map((card, index) => (
          <span
            key={card.id}
            className={[
              "relative animate-peel-aside",
              index === 0 ? "" : since.length > 2 ? "-ml-16" : "-ml-14",
            ].join(" ")}
            style={
              {
                "--peel-from": `calc(-3rem - ${index} * 0.75rem)`,
                "--peel-tilt": `${(index + 1) * 5}deg`,
                ...(card.id === named.id ? { "--peel-opacity": 1 } : {}),
              } as CSSProperties
            }
          >
            {card.id === named.id ? (
              <Marked card={card} label="named" size="md" lift irl={irl} />
            ) : (
              <PlayingCard card={card} size="md" mirrored={irl} />
            )}
          </span>
        ))}
      </span>

      {/* Still in their hand, so it is shown beside the card it was supposed to
          be played on. The pairing is the whole message. */}
      {buried ? null : (
        <span
          aria-hidden
          className={[
            "pointer-events-none absolute right-full top-1/2 z-10 mr-6",
            "-translate-y-1/2 animate-peel-mark",
          ].join(" ")}
        >
          <Marked card={named} label="named" size="md" lift irl={irl} />
        </span>
      )}
    </>
  );
}

/**
 * Who called it on whom, said out loud to the whole table before anybody gets
 * an explanation. The rule reads very differently once you've seen it land on
 * someone, so the news comes first and the lesson second.
 */
export function SunnyAnnounce({
  callerName,
  targetName,
  card,
  correct,
  onDone,
  ms,
}: {
  callerName: string;
  targetName: string;
  /** The card they named. An accusation is specific, so the table hears which. */
  card: Card;
  correct: boolean;
  onDone: () => void;
  ms: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, ms);
    return () => clearTimeout(timer);
  }, [onDone, ms]);

  return (
    <div
      role="status"
      // The one announcement nobody at this table may miss, so it clears the
      // island at both ends as well as the top — a ruling clipped in landscape
      // is the worst thing here to lose a word off.
      className={[
        "pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center p-4",
        "pt-[max(1rem,env(safe-area-inset-top))]",
        "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
      ].join(" ")}
    >
      <div className="max-w-md rounded-2xl bg-felt-900 px-5 py-3 text-center shadow-xl ring-1 ring-amber-300/40">
        <p className="text-base font-semibold text-amber-300">
          <span aria-hidden>☀️</span> {callerName} called the Sunny Rule on {targetName}
        </p>
        <p className="mt-0.5 text-sm text-white/60">
          Said they should have played the{" "}
          <span className="font-semibold text-white/80">
            {card.rank}
            {SUIT_GLYPH[card.suit]}
          </span>
          . {correct ? "They were right." : "They were wrong."}
        </p>
      </div>
    </div>
  );
}

/** A card named inline, in the suit's colour, the way the log names it. */
function CardChip({ card }: { card: Card }) {
  return (
    <span
      className={[
        "inline-block rounded px-1 py-px font-semibold tabular-nums",
        "bg-white",
        isRed(card.suit) ? "text-rose-600" : "text-slate-900",
      ].join(" ")}
      aria-label={`${card.rank} of ${SUIT_LABEL[card.suit].toLowerCase()}`}
    >
      <span aria-hidden>
        {card.rank}
        {SUIT_GLYPH[card.suit]}
      </span>
    </span>
  );
}

/**
 * The sentence a landed call opens with, and the reason this dialog exists.
 *
 * A call rewinds the game, takes two cards off you and hands everyone a new
 * card to match, and until #66 the table narrated none of it: the announcement
 * expired on a timer at the top of the screen while the forced play sat one tap
 * away at the bottom, so the punishment could be half over before its victim
 * knew it had started. Being caught is the loudest thing that happens in this
 * game and it now reads that way — it stops the table, it says who and what and
 * what it will cost, and the hand stays dead until it is dismissed.
 *
 * Only the offender sees it. Everyone else has the announcement banner, which
 * is all a bystander needs.
 *
 * It gives nothing away. The play being named is one the offender has already
 * been caught not making, and the card being turned up is one the whole table
 * watched them draw.
 */
export function SunnyCaught({
  callerName,
  skipped,
  returned,
  owesPunishment,
  onDone,
}: {
  callerName: string;
  /** The plays that were open to you. Usually one; occasionally a choice. */
  skipped: Card[];
  /** What the rewind took back, and what step three will turn up. */
  returned: Card[];
  /**
   * False when the skipped play is your last card. It eliminates you on the
   * spot and there is nothing left to pay the punishment with, so promising a
   * step that will never come would be its own small lie.
   */
  owesPunishment: boolean;
  onDone: () => void;
}) {
  const only = skipped.length === 1 ? skipped[0] : null;

  return (
    <div
      role="alertdialog"
      aria-modal
      aria-label="Caught by the Sunny Rule"
      className={[
        "fixed inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center",
        "pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]",
      ].join(" ")}
    >
      <div className="flex w-full max-h-full max-w-md flex-col overflow-hidden rounded-2xl bg-felt-900 ring-1 ring-amber-300/40">
        <div className="overflow-y-auto p-5 pb-4">
          <h2 className="text-xl font-semibold text-amber-300">
            <span aria-hidden>☀️</span> Caught by the Sunny Rule
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            <strong className="text-white">{callerName}</strong> called it on you — and they were
            right. You drew with a card you could have played. Your turn is forfeit; here's what it
            costs.
          </p>

          <ol className="mt-4 space-y-2 text-sm leading-relaxed text-white/80">
            <li className="flex gap-2.5">
              <span className="font-semibold text-amber-300">1.</span>
              <span>
                {only ? (
                  <>
                    Play the <CardChip card={only} /> you skipped.
                  </>
                ) : (
                  "Make the play you skipped — you had more than one."
                )}
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="font-semibold text-amber-300">2.</span>
              <span>
                {owesPunishment
                  ? "Give up a punishment card. Any card — it doesn't have to match."
                  : "That was your last card, so there's no punishment to pay — it puts you out of the game instead."}
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="font-semibold text-amber-300">3.</span>
              <span>
                {returned.length > 0 ? (
                  <>
                    You lose the{" "}
                    {returned.map((card, index) => (
                      <span key={card.id}>
                        {index > 0 ? ", " : null}
                        <CardChip card={card} />
                      </span>
                    ))}{" "}
                    you reached for. {returned.length > 1 ? "They go" : "It goes"} face up, and
                    that's the card everyone matches next.
                  </>
                ) : (
                  "You reached for an empty deck, so there's nothing to turn up. Your punishment card stays in play."
                )}
              </span>
            </li>
          </ol>
        </div>

        <div className="shrink-0 p-5 pt-0">
          <Button variant="primary" full onClick={onDone}>
            Take my medicine
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown the first time the rule touches you — which is how you're meant to
 * learn it. The joining explainer alludes to it and stops there, so this is
 * where every mechanic arrives, and it waits behind the announcement above so
 * you know what you're being taught about.
 */
export function SunnyExplainer({ onDone }: { onDone: () => void }) {
  return (
    <div
      className={[
        "fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center",
        "pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]",
        "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]",
      ].join(" ")}
    >
      <div className="flex w-full max-h-full max-w-md flex-col overflow-hidden rounded-2xl bg-felt-900 ring-1 ring-amber-300/30">
        <div className="overflow-y-auto p-5 pb-4">
          <h2 className="text-xl font-semibold text-amber-300">☀️ The Sunny Rule</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            Drawing a card when you had one you could have played is against the rules — and anyone can call you on it.
          </p>
          <ul className="ml-1.5 mt-3 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-white/80 marker:text-white/40">
            <li>
              <strong className="text-white">To call it:</strong> tap the sun, then tap the card you say they should have played.
            </li>
            <li>
              <strong className="text-white">Right:</strong> they play that card, plus a second card as a punishment.
            </li>
            <li>
              <strong className="text-white">Wrong:</strong> nobody loses a card, but you can't call again for three draws.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            Nothing here will tell you whether you're right. That's what the face-up hands are for.
          </p>
        </div>
        <div className="shrink-0 p-5 pt-0">
          <Button variant="primary" full onClick={onDone}>
            Understood
          </Button>
        </div>
      </div>
    </div>
  );
}

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

/**
 * Naming the suit, without being shut in a box to do it.
 *
 * Deliberately not a modal. Choosing well means counting what everyone else is
 * holding — the whole table is face up for exactly that reason — and an overlay
 * with a scrim over it took the evidence away at the one moment you needed to
 * read it. So it docks to the bottom of the table instead: nothing is covered,
 * the seats still scroll, and it travels with you while you look around.
 *
 * Your own cards aren't tappable during this phase anyway, so there is no move
 * to fumble while it's up.
 */
export function SuitPicker({
  onPick,
  compact = false,
}: {
  onPick: (suit: "C" | "D" | "H" | "S") => void;
  /** Landscape: one row of four, shorter, and the aside goes. */
  compact?: boolean;
}) {
  const suits = [
    { key: "H", glyph: "♥", label: "Hearts", red: true },
    { key: "D", glyph: "♦", label: "Diamonds", red: true },
    { key: "S", glyph: "♠", label: "Spades", red: false },
    { key: "C", glyph: "♣", label: "Clubs", red: false },
  ] as const;

  return (
    <section
      aria-label="Name a suit"
      className={[
        "z-20 rounded-2xl bg-felt-900/95 shadow-xl ring-1 ring-amber-300/40 backdrop-blur",
        compact ? "p-2" : "sticky bottom-2 p-3",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-amber-300">Name a suit</h2>
        {compact ? null : (
          <p className="truncate text-xs text-white/50">
            Take your time — look at the next players' cards.
          </p>
        )}
      </div>
      <div className={["grid grid-cols-4", compact ? "mt-1.5 gap-1.5" : "mt-2 gap-2"].join(" ")}>
        {suits.map((suit) => (
          <button
            key={suit.key}
            type="button"
            onClick={() => onPick(suit.key)}
            aria-label={suit.label}
            className={[
              "flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white",
              compact ? "min-h-11 text-xl" : "min-h-14 text-2xl",
              "font-semibold shadow-lg transition-transform hover:-translate-y-0.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
              suit.red ? "text-rose-600" : "text-slate-900",
            ].join(" ")}
          >
            <span aria-hidden>{suit.glyph}</span>
            <span className="text-[0.65rem] font-medium text-slate-500">{suit.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
