import { useLayoutEffect, useRef, useState } from "react";

import type { ClientMessage, GameView, RoomView, Suit } from "@goleta/engine";

import { Hand, HandSortButton } from "../components/Hand.tsx";
import { HelpLink, HelpShout } from "../components/Help.tsx";
import { PeekStrip } from "../components/PeekStrip.tsx";
import { SunnyAccusePicker, SuitPicker } from "../components/Sunny.tsx";
import { Button } from "../components/ui.tsx";
import type { NameOf } from "../lib/format.ts";
import { handSize, handStep } from "../lib/handFan.ts";
import type { HandMode } from "../components/Hand.tsx";
import type { HandSort } from "../lib/sort.ts";
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
  canDraw: boolean;
  onDraw: () => void;
  prompt: string;
  mine: boolean;
  handSort: HandSort;
  onCycleSort: () => void;
  stalled: boolean;
  onAskForHelp: () => void;
  shouting: boolean;
  /** The Sunny call being composed, if any — the state lives on `Table`. */
  accusing: string | null;
  stillAccusable: boolean;
  onStartAccusing: (playerId: string) => void;
  onStopAccusing: () => void;
  onAccuse: (cardId: string) => void;
  onShowFullTable: () => void;
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
 * Everything else that used to live down the side of the table has to fit in
 * one short, wide viewport, and the rule for all of it is the same: it docks
 * over the hand rather than covering it. The picker especially — it is asking
 * you to compare a hand against a board, and a scrim over the cards at that
 * exact moment was the wrong trade on the full table and is a worse one here.
 *
 * What is *not* here is anybody else's hand, at any size. A sliver too small to
 * read a rank off is worse than nothing — `fan.ts` has a floor for exactly that
 * reason — so the toggle to the full table is where hands live, and it is
 * available the whole time a game is running rather than only on your turn.
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
  canDraw,
  onDraw,
  prompt,
  mine,
  handSort,
  onCycleSort,
  stalled,
  onAskForHelp,
  shouting,
  accusing,
  stillAccusable,
  onStartAccusing,
  onStopAccusing,
  onAccuse,
  onShowFullTable,
}: HandViewProps) {
  /**
   * The room the hand has to spend, measured rather than assumed — the same
   * approach the seat strip takes, and for the same reason: how big the cards
   * go and how tight they close up is arithmetic on a real box, not a guess at
   * a phone. Both axes, because they answer different questions: the height
   * decides the card size, the width decides the overlap.
   */
  const row = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    const watch = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBox((current) => {
        const next = { width: Math.floor(width), height: Math.floor(height) };
        return current.width === next.width && current.height === next.height ? current : next;
      });
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  // Measured against the row's *content* box, and the row is the only thing
  // with padding — the hand inside it has none when it is fanning. So this is
  // the width the cards actually get, with nothing subtracted by hand.
  const size = handSize(box.height);
  const step = handStep(box.width, cards.length, size);
  const me = game.you ?? "";

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <PeekStrip
        room={room}
        game={game}
        nameOf={nameOf}
        canDraw={canDraw}
        onDraw={onDraw}
        onCallSunny={onStartAccusing}
        offline={offline}
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
        {/* The cap is enough for the heading, the line under it and two rows of
            cards before the panel starts scrolling. An offender holding twenty
            is real, and a picker that grew to fit them would eat the hand it
            docked above; the hand keeps the rest either way. */}
        {accusing !== null && stillAccusable && game.sunnyReach ? (
          <div className="max-h-[55%] shrink-0 overflow-y-auto px-2 pt-1">
            <SunnyAccusePicker
              targetName={nameOf(accusing)}
              reach={game.sunnyReach}
              onPick={onAccuse}
              onCancel={onStopAccusing}
              compact
            />
          </div>
        ) : null}

        {game.phase.kind === "suit" && mine ? (
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
        <div ref={row} className="relative flex min-h-0 flex-1 flex-col justify-center px-1">
          {/* Your own shout, over your own cards, same as everyone else sees. */}
          {shouting ? <HelpShout /> : null}

          <div
            className={[
              "rounded-2xl transition-colors",
              mine ? "ring-1 ring-amber-300/60" : "",
            ].join(" ")}
          >
            <Hand
              cards={cards}
              legalCardIds={game.legalCardIds}
              mode={mode}
              assist={assist}
              onChoose={onChooseCard}
              size={size}
              step={step}
            />
          </div>
        </div>
      </div>

      {/* One line at the foot: what the table is waiting for, and the way back
          to the whole of it. */}
      <footer className="flex shrink-0 items-center gap-3 px-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-0.5">
        {stalled ? <HelpLink onAsk={onAskForHelp} /> : null}
        {/* Yours alone: the server sends this to nobody else. */}
        {game.sunnyLockedDraws > 0 ? (
          <span className="shrink-0 text-xs text-white/35" aria-live="polite">
            <span aria-hidden>☀️</span> call missed — {game.sunnyLockedDraws} more{" "}
            {game.sunnyLockedDraws === 1 ? "draw" : "draws"}
          </span>
        ) : null}

        <p
          className={[
            "min-w-0 flex-1 truncate text-center text-xs",
            mine ? "font-semibold text-amber-300" : "text-white/50",
          ].join(" ")}
          aria-live="polite"
        >
          {prompt}
        </p>

        {cards.length > 1 ? (
          <HandSortButton sort={handSort} onCycle={onCycleSort} className="shrink-0" />
        ) : null}
        <Button
          variant="ghost"
          className="min-h-0 shrink-0 px-2 py-1 text-xs"
          onClick={onShowFullTable}
        >
          <span aria-hidden>⇄</span> full table
        </Button>
      </footer>
    </div>
  );
}
