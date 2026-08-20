import { useRef } from "react";

import type { Suit } from "@goleta/engine";

import { Hand, HandSortButton } from "../components/Hand.tsx";
import { HandFrame, SunnyCallOffer } from "../components/HandFrame.tsx";
import { HelpLink, HelpShout } from "../components/Help.tsx";
import { PeekStrip } from "../components/PeekStrip.tsx";
import { SunnyAccusePicker } from "../components/sunny/SunnyAccusePicker.tsx";
import { SuitPicker } from "../components/sunny/SuitPicker.tsx";
import { turnPrompt } from "../lib/format.ts";
import { handHeight, handStep } from "../lib/handFan.ts";
import { useBox } from "../lib/measure.ts";
import { useMotion } from "../lib/motion.ts";
import { cardWidthAt } from "../lib/cardShape.ts";
import type {
  HandControls,
  HelpControls,
  SunnyControls,
  TableContext,
} from "../lib/tableProps.ts";

export interface HandViewProps {
  table: TableContext;
  hand: HandControls;
  help: HelpControls;
  sunny: SunnyControls;
  onShowInvite: () => void;
  /** The way back to the rules (#195). This view has no header, so the answer to
   * "what happens if I can't play anything?" was to turn the phone over. */
  onShowRules: () => void;
}

/**
 * A phone in landscape, at a table of people who are looking at each other.
 *
 * The upright table is one screen showing everything, which is right for a
 * browser tab and wrong for a phone lying between six people, where your own
 * cards got a fifth of the display. Here they get most of it, and the table
 * centre peeks over the top (#78). Since #131 they get the rest as well: there
 * is a strip and there is the hand, and nothing under it — a line of small print
 * at the foot cost a card size.
 *
 * Everything that used to live down the side of the table docks over the hand
 * rather than covering it. The picker especially: it asks you to compare a hand
 * against a board, and a scrim over the cards at that moment is the wrong trade.
 *
 * What is *not* here is anybody else's hand, at any size. A sliver too small to
 * read a rank off is worse than nothing (`fan.ts` has a floor), so the full
 * table is one turn of the phone away the whole time a game is running.
 */
export function HandView({ table, hand, help, sunny, onShowInvite, onShowRules }: HandViewProps) {
  const { room, game, nameOf, send, offline, reshuffling } = table;
  const { cards, mode, assist, onChooseCard, refusal, canDraw, onDraw, mine } = hand;
  const { handSort, onCycleSort } = hand;
  const { stalled, onAskForHelp, hints, onChooseHints, shouting, helpFrom } = help;
  const { accusing, stillAccusable, onStartAccusing, onStopAccusing, onAccuse } = sunny;
  const sunnyTarget = sunny.target;
  /**
   * The room the hand has to spend, measured rather than assumed. Both axes,
   * because they answer different questions: the height decides the card size,
   * the width decides the overlap.
   */
  const row = useRef<HTMLDivElement>(null);
  const box = useBox(row);

  /**
   * The strip's line, and whether the picker is allowed up yet. Worked out here
   * because both need `dealing` and `Table` renders the motion provider rather
   * than sitting under it. Under Dealer's Choice the game opens in
   * `phase: "suit"`, so without this the picker took its room out of the column
   * while the cards were still going out (#75).
   */
  const { dealing } = useMotion();
  const prompt = turnPrompt(game, nameOf, assist, dealing, reshuffling);

  // Measured against the row's *content* box, and the row is the only thing with
  // padding, so this is the width the cards actually get.
  const height = handHeight(box.height);
  const step = handStep(box.width, cards.length, cardWidthAt(height), undefined, true);
  const me = game.you ?? "";

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      {/* Everything that isn't your cards, in one line across the top. The row of
          furniture that used to sit under them is gone: it cost the hand a card
          size, and none of what was on it is worth one (#131). */}
      <PeekStrip
        room={room}
        game={game}
        canDraw={canDraw}
        onDraw={onDraw}
        offline={offline}
        helpFrom={helpFrom}
        prompt={prompt}
        // Loud for your own turn, and for the deck running out — which is nobody's
        // turn and is the more important of the two while it lasts.
        loud={mine || reshuffling !== null}
        onShowInvite={onShowInvite}
        onShowRules={onShowRules}
        hints={hints}
        onChooseHints={onChooseHints}
        seated={game.you !== null}
        send={send}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/*
          The way into a call, hung under the strip at the end furthest from the
          deck (#189). The sun used to sit *in* the strip, immediately before the
          draw pile, so a bigger version could only grow towards the deck — and a
          fat target beside the deck is a mis-tap into the exact violation it
          accuses. Absolute, so it never moves the cards underneath it.
        */}
        {sunnyTarget ? (
          <SunnyCallOffer
            targetName={nameOf(sunnyTarget)}
            lockedDraws={game.sunnyLockedDraws}
            onCall={() => onStartAccusing(sunnyTarget)}
            className="left-2 top-2"
          />
        ) : null}

        {/*
          Both pickers **dock**: they take their room out of the column rather
          than being laid over it. Overlaying covers the cards the picker is
          asking you to compare against — the trade the full table already
          refused. The row below measures what is left, so the hand steps down a
          size while a picker is up and steps back when it goes.
        */}
        {/* One row of cards however many the offender holds, so its height is
            known and the hand below simply steps down. It used to be capped at a
            fraction of the column, which left both halves short — see #96. */}
        {accusing !== null && stillAccusable && game.sunnyReach ? (
          <div className="shrink-0 px-2 pt-1">
            <SunnyAccusePicker
              targetName={nameOf(accusing)}
              reach={game.sunnyReach}
              onPick={onAccuse}
              onCancel={onStopAccusing}
              compact
              irl
            />
          </div>
        ) : null}

        {game.phase.kind === "suit" && mine && !dealing ? (
          <div className="shrink-0 px-2 pt-1">
            <SuitPicker
              compact
              onPick={(suit: Suit) =>
                send({ t: "intent", intent: { type: "chooseSuit", playerId: me, suit } })
              }
            />
          </div>
        ) : null}

        {/* The hand sits in the middle of whatever is left rather than hugging the
            foot of the screen. */}
        {/*
          The side insets go on the measured box, which is what makes the fan
          honour them for free: `useBox` reads the content box, so `handStep` is
          handed the width the cards actually get. It costs the fan ~59pt on the
          island side, taken deliberately — an end card behind the island is the
          same failure `fan.ts`'s floor exists to prevent, by another route.
        */}
        {/*
          The bottom inset is on this row too, now that nothing sits under it —
          the footer's old `pb` moved up rather than a new rule. `useBox` reads
          the content box, so the height already has the home indicator taken
          off, which is the difference between a rung it can hold and one that
          draws its bottom row of cards under a swipe bar.
        */}
        <div
          ref={row}
          className={[
            // `justify-end`, not `justify-center`: whatever the row has left over belongs
            // above the cards, not split into a band of bare felt under them
            // (#166).
            "relative flex min-h-0 flex-1 flex-col justify-end",
            "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
            "pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))]",
          ].join(" ")}
        >
          {/* Your own shout, over your own cards, same as everyone else sees. */}
          {shouting ? <HelpShout kind={shouting} /> : null}

          {/* The same answer in the same place as upright: turning the phone must
              not move where a refusal appears (#99). */}
          <HandFrame mine={mine} refusal={refusal}>
            <Hand
              cards={cards}
              legalCardIds={game.legalCardIds}
              mode={mode}
              assist={assist}
              onChoose={onChooseCard}
              height={height}
              step={step}
              irl
              fit
            />
          </HandFrame>
        </div>
      </div>

      {/*
        The felt's own printing, in the two bottom corners. Both are about your
        own hand, and your own hand is at the bottom of this screen — they were
        at the top only because there was nowhere else. A row *under* the cards
        costs a card size (#131), so they are laid over the felt, outside the box
        `useBox` measures (#167). Small, quiet, and above the cards rather than
        under them: printing you cannot press is not a control.
      */}
      {stalled ? (
        <div
          className={[
            "absolute bottom-0 left-0 z-20",
            "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
            "pl-[max(0.5rem,env(safe-area-inset-left))]",
          ].join(" ")}
        >
          <HelpLink onAsk={onAskForHelp} />
        </div>
      ) : null}

      {cards.length > 1 ? (
        <div
          className={[
            "absolute bottom-0 right-0 z-20",
            "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
            "pr-[max(0.5rem,env(safe-area-inset-right))]",
          ].join(" ")}
        >
          <HandSortButton sort={handSort} onCycle={onCycleSort} />
        </div>
      ) : null}
    </div>
  );
}
