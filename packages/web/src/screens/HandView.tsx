import { useRef } from "react";

import type { Suit } from "@goleta/engine";

import { Hand, HandSortButton } from "../components/Hand.tsx";
import { EndTurnButton } from "../components/EndTurn.tsx";
import { HandFrame } from "../components/HandFrame.tsx";
import { HelpLink, HelpShout } from "../components/Help.tsx";
import { PeekStrip } from "../components/PeekStrip.tsx";
import { ScrollRelease } from "../components/ScrollRelease.tsx";
import { SunnyAccusePicker } from "../components/sunny/SunnyAccusePicker.tsx";
import { SuitPicker } from "../components/sunny/SuitPicker.tsx";
import { turnPrompt } from "../lib/format.ts";
import { handHeight, handStep } from "../lib/handFan.ts";
import { useBox } from "../lib/measure.ts";
import { useMotion } from "../lib/motion.ts";
import { cardWidthAt } from "../lib/cardShape.ts";
import { usePrintScale } from "../lib/largePrint.ts";
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
  /** This view has no header, so the answer to "what happens if I can't play
   * anything?" was to turn the phone over (#195). */
  onShowRules: () => void;
}

/**
 * A phone in landscape, at a table of people who are looking at each other.
 *
 * The upright table is one screen showing everything, which is right for a
 * browser tab and wrong for a phone lying between six people, where your own
 * cards got a fifth of the display (#78). Since #131 there is a strip and there
 * is the hand, and nothing under it — a line of small print at the foot cost a
 * card size.
 *
 * Everything that used to live down the side of the table docks over the hand
 * rather than covering it. What is *not* here is anybody else's hand, at any
 * size: a sliver too small to read a rank off is worse than nothing.
 */
export function HandView({ table, hand, help, sunny, onShowInvite, onShowRules }: HandViewProps) {
  const { room, game, nameOf, send, offline, reshuffling, departed, judging } = table;
  const { cards, mode, assist, onChooseCard, refusal, canDraw, onDraw, mine } = hand;
  const { handSort, onCycleSort } = hand;
  const { stalled, onAskForHelp, hints, onChooseHints, shouting, helpFrom } = help;
  const { accusing, stillAccusable, onStartAccusing, onStopAccusing, onAccuse } = sunny;
  const sunnyTarget = sunny.target;
  /** Both axes: the height decides the card size, the width decides the overlap. */
  const row = useRef<HTMLDivElement>(null);
  const box = useBox(row);

  /**
   * Worked out here because both need `dealing` and `Table` renders the motion
   * provider rather than sitting under it. Under Dealer's Choice the game opens
   * in `phase: "suit"`, so without this the picker took its room out of the
   * column while the cards were still going out (#75).
   */
  const { dealing } = useMotion();
  const prompt = turnPrompt(game, nameOf, assist, dealing, judging, reshuffling, departed);

  // The row is the only thing with padding, so this is the width the cards get.
  // The row it is measuring has already shrunk by whatever large print took out
  // of the strip above it, so the cards give some of the scale straight back —
  // and get it again on the face, which is nearly twice the ink (#323).
  const scale = usePrintScale();
  const height = handHeight(box.height, scale);
  const step = handStep(box.width, cards.length, cardWidthAt(height), undefined, true, scale);
  const me = game.you ?? "";

  return (
    <>
      {/* `sticky top-0` rather than plain flow: `ScrollRelease` below leaves room
          under this screen for a drag to collapse the address bar into, and
          pinning is what stops that scroll moving the hand under a thumb
          (#131, #327).

          It replaces `relative` rather than joining it: both set `position`, and
          Tailwind emits `relative` last, so the two together are just `relative`
          and the pin silently does nothing. `sticky` establishes a containing
          block for the absolute corners below exactly as `relative` did. */}
      <div className="sticky top-0 flex h-dvh flex-col overflow-hidden">
        {/* The row of furniture that used to sit under the cards is gone: it cost
            the hand a card size, and none of it was worth one (#131). */}
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
          loud={mine || judging || reshuffling !== null || departed !== null}
          onShowInvite={onShowInvite}
          onShowRules={onShowRules}
          hints={hints}
          onChooseHints={onChooseHints}
          seated={game.you !== null}
          send={send}
          // The sun sits in the strip's left cluster now, at the far end of the row
          // from the deck (#329).
          sunnyTargetName={sunnyTarget ? nameOf(sunnyTarget) : null}
          onStartAccusing={() => {
            if (sunnyTarget) onStartAccusing(sunnyTarget);
          }}
        />

        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* No sun hanging under the strip any more (#329). It is in the strip's
            left cluster now — which is not #189 being undone: #189's objection was
            that it was drawn immediately before the *draw pile* at the row's
            right-hand end, and the cluster is the far end of the same row from the
            deck. What the move buys is a control that does not appear and
            disappear over the felt on every draw, in a different place depending
            on which way up the phone is. */}

          {/* The one moment the table is waiting for something with a button attached
            (#260). Absolute and centred under the strip, so it never moves the
            cards and is nowhere near the draw pile at the strip's right-hand end —
            which matters more here than anywhere, since this control can now commit
            the offence a mis-tap into the deck would. */}
          {hand.canEndTurn ? (
            <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2">
              <EndTurnButton onEndTurn={hand.onEndTurn} className="pointer-events-auto" />
            </div>
          ) : null}

          {/* Both pickers **dock** rather than being laid over the column: overlaying
            covers the cards the picker is asking you to compare against. The row
            below measures what is left, so the hand steps down a size while a
            picker is up and back when it goes. */}
          {/* One row however many the offender holds, so its height is known. It used
              to be capped at a fraction of the column, which left both halves
              short — see #96. */}
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
      <ScrollRelease />
    </>
  );
}
