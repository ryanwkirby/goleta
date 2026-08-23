import type { Ref } from "react";
import type { GameView } from "@goleta/engine";

import { Hand, HandSortButton } from "../../components/Hand.tsx";
import { HandFrame, SunnyCallOffer } from "../../components/HandFrame.tsx";
import { HelpLink, HelpShout } from "../../components/Help.tsx";
import type { NameOf } from "../../lib/format.ts";
import { FULL_TABLE } from "../../motion/plan.ts";
import type { HandControls, HelpControls, SunnyControls } from "../../lib/tableProps.ts";

/**
 * Your own cards at the foot of the upright table, and the small print that
 * belongs to them. **Everything in here belongs to a seat**: a watcher is shown
 * nothing that implies they are at the table, which the caller decides by not
 * rendering this at all.
 */
export function OwnHand({
  game,
  nameOf,
  hand,
  help,
  sunny,
  irl,
  step,
  boxRef,
}: {
  game: GameView;
  nameOf: NameOf;
  hand: HandControls;
  help: HelpControls;
  sunny: SunnyControls;
  irl: boolean;
  /** Left edge to left edge, fitted against the measured box below. */
  step: number;
  /** The upright table measures this to fit the fan against. */
  boxRef: Ref<HTMLDivElement>;
}) {
  return (
    <div className="relative flex flex-col">
      {/*
        The way into a call, over the felt just above your own cards — where your
        eyes are during somebody else's turn (#189). Not the middle: that is where
        your own `HelpShout` rises.

        **Pinned right** since #257, because most people are right-handed and this
        is the one control whose window closes when somebody else moves. The piles
        are mid-screen and a whole prompt line away, so it is nowhere near the
        draw pile even after #259 moved that to the right as well. Landscape keeps
        its left corner, where the argument runs the other way — the strip's deck
        *is* at the right-hand end.
      */}
      {sunny.target ? (
        <SunnyCallOffer
          targetName={nameOf(sunny.target)}
          lockedDraws={game.sunnyLockedDraws}
          onCall={() => sunny.target && sunny.onStartAccusing(sunny.target)}
          className="-top-12 right-0"
        />
      ) : null}

      {/* Kept clear whether or not the offer is showing, so the hand doesn't move
          under your fingers when it appears. */}
      <div className="flex min-h-7 items-center gap-2 px-1">
        {help.stalled ? <HelpLink onAsk={help.onAskForHelp} /> : null}
        {/* Yours alone: the server sends this to nobody else. */}
        {game.sunnyLockedDraws > 0 ? (
          <span className="text-xs text-white/35" aria-live="polite">
            <span aria-hidden>☀️</span> call missed — {game.sunnyLockedDraws} more{" "}
            {game.sunnyLockedDraws === 1 ? "draw" : "draws"}
          </span>
        ) : null}
        {hand.cards.length > 1 ? (
          <HandSortButton sort={hand.handSort} onCycle={hand.onCycleSort} className="ml-auto" />
        ) : null}
      </div>

      {/* Your own shout, over your own cards, same as everyone else sees. */}
      {help.shouting ? <HelpShout kind={help.shouting} /> : null}

      {/* The same frame every other seat gets when the table is waiting on it:
          your own cards aren't in the strip, so the one seat that most wants the
          highlight was the only one without it.

          It is also the box the fan is fitted against — no padding of its own,
          and its width comes from the column above rather than from the cards
          inside it, so measuring it cannot feed back into what it measures. */}
      <HandFrame ref={boxRef} mine={hand.mine} refusal={hand.refusal}>
        <Hand
          cards={hand.cards}
          legalCardIds={game.legalCardIds}
          mode={hand.mode}
          assist={hand.assist}
          onChoose={hand.onChooseCard}
          // Named rather than left to `Hand`'s default: the step above is fitted
          // against this rung's width, and the two have to be the same rung.
          size={FULL_TABLE.hand}
          step={step}
          fit
          irl={irl}
        />
      </HandFrame>
    </div>
  );
}
