import { useRef } from "react";

import type { ClientMessage, GameView, RoomView, Suit } from "@goleta/engine";

import { Hand } from "../components/Hand.tsx";
import { HelpShout } from "../components/Help.tsx";
import { MoveRefusal } from "../components/Refusal.tsx";
import { PeekStrip } from "../components/PeekStrip.tsx";
import { SunnyAccusePicker, SuitPicker } from "../components/Sunny.tsx";
import { turnPrompt, type NameOf } from "../lib/format.ts";
import { handSize, handStep } from "../lib/handFan.ts";
import { useBox } from "../lib/measure.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import type { HandMode } from "../components/Hand.tsx";
import type { HandSort } from "../lib/sort.ts";
import type { GoletaError } from "../net/useGoleta.ts";
import type { Card } from "@goleta/engine";

export interface HandViewProps {
  room: RoomView;
  game: GameView;
  nameOf: NameOf;
  send: (message: ClientMessage) => void;
  offline: boolean;
  /** Your hand, already in whatever order you asked for. */
  cards: Card[];
  mode: HandMode;
  assist: boolean;
  onChooseCard: (cardId: string) => void;
  /** A refused move, shown against the top edge of the hand — same as upright. */
  refusal: GoletaError | null;
  canDraw: boolean;
  onDraw: () => void;
  mine: boolean;
  handSort: HandSort;
  onCycleSort: () => void;
  stalled: boolean;
  onAskForHelp: () => void;
  onShowInvite: () => void;
  shouting: boolean;
  /**
   * Somebody else asking for a hand, by name — drawn in the strip, because this
   * view has no seats for it to rise off and a table that can't see the ask is
   * a table where help stopped being public.
   */
  helpFrom: string | null;
  /** The Sunny call being composed, if any — the state lives on `Table`. */
  accusing: string | null;
  stillAccusable: boolean;
  onStartAccusing: (playerId: string) => void;
  onStopAccusing: () => void;
  onAccuse: (cardId: string) => void;
}

/**
 * A phone in landscape, at a table of people who are looking at each other.
 *
 * The M1 table is one screen showing everything — the seat strip with every
 * hand face up, the piles, your hand, the log. That is right for a browser tab
 * you are staring into and wrong for a phone lying on a table between six
 * people, where your own cards, the thing you actually have to decide from, got
 * a fifth of the screen. Here they get most of it, at the size the pile used to
 * be, and the table centre peeks over the top (#78).
 *
 * Since #131 they get the rest of it as well. There is a strip and there is the
 * hand, and nothing under it: the line of small print that used to sit at the
 * foot cost a card size — `handSize` reads what the row is left — and every item
 * on it was quiet enough to move up into the strip instead. What the table is
 * waiting for is said in the strip's own words now, which were a shorter version
 * of the same sentence.
 *
 * Everything else that used to live down the side of the table has to fit in
 * one short, wide viewport, and the rule for all of it is the same: it docks
 * over the hand rather than covering it. The picker especially — it is asking
 * you to compare a hand against a board, and a scrim over the cards at that
 * exact moment was the wrong trade on the full table and is a worse one here.
 *
 * What is *not* here is anybody else's hand, at any size. A sliver too small to
 * read a rank off is worse than nothing — `fan.ts` has a floor for exactly that
 * reason — so the full table is where hands live, and it is one turn of the
 * phone away the whole time a game is running rather than only on your turn.
 * Upright is the table, sideways is your hand, and nothing on either screen
 * needs tapping to say so.
 */
export function HandView({
  room,
  game,
  nameOf,
  send,
  offline,
  cards,
  mode,
  assist,
  onChooseCard,
  refusal,
  canDraw,
  onDraw,
  mine,
  handSort,
  onCycleSort,
  stalled,
  onAskForHelp,
  onShowInvite,
  shouting,
  helpFrom,
  accusing,
  stillAccusable,
  onStartAccusing,
  onStopAccusing,
  onAccuse,
}: HandViewProps) {
  /**
   * The room the hand has to spend, measured rather than assumed — the same
   * approach the seat strip takes, and for the same reason: how big the cards
   * go and how tight they close up is arithmetic on a real box, not a guess at
   * a phone. Both axes, because they answer different questions: the height
   * decides the card size, the width decides the overlap.
   */
  const row = useRef<HTMLDivElement>(null);
  const box = useBox(row);

  /**
   * The strip's line, and whether the picker is allowed up yet.
   *
   * Worked out here rather than handed down, because both answers need
   * `dealing` and `Table` renders the motion provider rather than sitting under
   * it. Under Dealer's Choice the game opens in `phase: "suit"`, so without this
   * the strip asked for a suit — and the picker took its room out of the column,
   * shrinking the hand — while the cards were still going out (#75).
   */
  const { dealing } = useMotion();
  const prompt = turnPrompt(game, nameOf, assist, dealing);

  // Measured against the row's *content* box, and the row is the only thing
  // with padding — the hand inside it has none when it is fanning. So this is
  // the width the cards actually get, with nothing subtracted by hand.
  const size = handSize(box.height);
  const step = handStep(box.width, cards.length, size, undefined, true);
  const me = game.you ?? "";

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Everything that isn't your cards, in one line across the top. The row
          of furniture that used to sit under them is gone: it cost the hand a
          card size, and none of what was on it — the prompt the strip was
          already saying a thinner version of, the sort control, the offer of
          help, the draws left on a missed call — is worth one (#131). */}
      <PeekStrip
        room={room}
        game={game}
        nameOf={nameOf}
        canDraw={canDraw}
        onDraw={onDraw}
        onCallSunny={onStartAccusing}
        offline={offline}
        helpFrom={helpFrom}
        prompt={prompt}
        mine={mine}
        sortable={cards.length > 1}
        handSort={handSort}
        onCycleSort={onCycleSort}
        stalled={stalled}
        onAskForHelp={onAskForHelp}
        onShowInvite={onShowInvite}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {/*
          Both pickers **dock**: they take their room out of the column rather
          than being laid over it. Overlaying was the obvious thing and it was
          wrong — the accusation picker is asking you to compare a hand against
          a board, and a panel that sits on top of your own cards at that exact
          moment is the trade the full table already refused to make.

          Because the row below measures what is left, the hand simply steps
          down a size while a picker is up, and steps back when it goes. That
          fall-back is the whole reason `handSize` reads a height instead of
          being told one.
        */}
        {/* No cap and no scroll: the picker is one row of cards however many
            the offender is holding, so its height is known and the hand below
            simply steps down a size to make the room. It used to be capped at a
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

        {/* The hand sits in the middle of whatever is left rather than hugging
            the foot of the screen: this view exists because your own cards were
            the thing you decide from and were getting a fifth of the display,
            and parking them at the bottom of an empty field is only half a fix. */}
        {/*
          The side insets go on the measured box, which is what makes the fan
          honour them for free: `useBox` reads the content box, so `handStep`
          below is handed the width the cards actually get and closes the fan up
          by the rules it already has. Nothing subtracts hardware by hand.

          It costs the fan ~59pt of width on the island side, and that is the
          trade being taken deliberately. `fan.ts` has a floor because a card you
          cannot read is a play you cannot spot, and an end card behind the
          island is that same failure by another route — so the fan tightens,
          which is the release valve it already has. Letting the row bleed would
          keep the arithmetic looking healthy while the hardware overruled it.
        */}
        {/*
          The bottom inset is on this row too, now that nothing sits under it.
          It is the footer's old `pb` moved up rather than a new rule: the felt
          bleeds to the edge and the content insets from it, and the hand is the
          bottom-most content there is. `useBox` reads the content box, so the
          height `handSize` is handed already has the home indicator taken off —
          which is the difference between a rung it can hold and a rung that
          draws its bottom row of cards under a swipe bar.
        */}
        <div
          ref={row}
          className={[
            "relative flex min-h-0 flex-1 flex-col justify-center",
            "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
            "pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))]",
          ].join(" ")}
        >
          {/* Your own shout, over your own cards, same as everyone else sees. */}
          {shouting ? <HelpShout /> : null}

          <div
            className={[
              "relative rounded-2xl transition-colors",
              mine ? "ring-1 ring-amber-300/60" : "",
            ].join(" ")}
          >
            {/* The same answer in the same place as upright: turning the phone
                must not move where a refusal appears. */}
            {refusal ? <MoveRefusal key={refusal.id} error={refusal} /> : null}
            <Hand
              cards={cards}
              legalCardIds={game.legalCardIds}
              mode={mode}
              assist={assist}
              onChoose={onChooseCard}
              size={size}
              step={step}
              irl
              fit
            />
          </div>
        </div>
      </div>
    </div>
  );
}
