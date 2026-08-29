import type { Ref } from "react";
import type { AutopilotMode, GameView } from "@goleta/engine";

import { AutopilotReturn } from "../../components/Autopilot.tsx";
import { Hand, HandSortButton } from "../../components/Hand.tsx";
import { HandFrame } from "../../components/HandFrame.tsx";
import { HelpLink, HelpShout } from "../../components/Help.tsx";
import { FULL_TABLE } from "../../motion/plan.ts";
import type { HandControls, HelpControls } from "../../lib/tableProps.ts";

/**
 * Your own cards at the foot of the upright table, and the small print that
 * belongs to them. **Everything in here belongs to a seat**: a watcher is shown
 * nothing that implies they are at the table, which the caller decides by not
 * rendering this at all.
 */
export function OwnHand({
  game,
  hand,
  help,
  irl,
  autopilot,
  onEndAutopilot,
  step,
  boxRef,
}: {
  game: GameView;
  hand: HandControls;
  help: HelpControls;
  irl: boolean;
  /** Your own seat's mode. `off` draws nothing (#368). */
  autopilot: AutopilotMode;
  onEndAutopilot: () => void;
  /** Left edge to left edge, fitted against the measured box below. */
  step: number;
  /** The upright table measures this to fit the fan against. */
  boxRef: Ref<HTMLDivElement>;
}) {
  return (
    <div className="relative flex flex-col">
      {/* No sun here any more (#329). It was pinned over the felt just above these
          cards, appearing and disappearing on every draw — most turns of most
          games — and in a different place depending on which way up the phone was
          held. It is in the header now, top centre, which is the full height of
          the column from the piles. */}

      {/* Kept clear whether or not the offer is showing, so the hand doesn't move
          under your fingers when it appears. */}
      <div className="flex min-h-7 items-center gap-2 px-1">
        {/* First in the row, because it is the one thing here somebody is
            actively looking for rather than being offered (#368). The row is
            kept clear either way, so a control appearing in it never resizes the
            hand under a thumb (#131) — which is the whole reason this is the
            line and not a new one. */}
        <AutopilotReturn mode={autopilot} onEnd={onEndAutopilot} />
        {help.stalled ? <HelpLink onAsk={help.onAskForHelp} /> : null}
        {/* Yours alone: the server sends this to nobody else. */}
        {game.sunnyLockedReaches > 0 ? (
          <span className="text-xs text-white/35" aria-live="polite">
            <span aria-hidden>☀️</span> call missed — {game.sunnyLockedReaches} more{" "}
            {game.sunnyLockedReaches === 1 ? "reach" : "reaches"}
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
