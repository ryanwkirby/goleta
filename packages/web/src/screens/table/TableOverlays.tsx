import type { Card } from "@goleta/engine";

import { Graduation } from "../../components/Help.tsx";
import { RoomInvite } from "../../components/RoomInvite.tsx";
import { SunnyAnnounce, SunnyCaught, SunnyExplainer } from "../../components/Sunny.tsx";
import { ANNOUNCE_MS } from "../../lib/beats.ts";
import type { SunnyCalled } from "../../lib/judgedCall.ts";

/**
 * Everything the table draws *over* itself: a ruling, a punishment, an
 * explanation, an invite, and the one question a first finished game asks.
 *
 * `Table.tsx` returns three different screens that can each carry some of
 * these, and every one of them wrote out its own copy — `SunnyExplainer` three
 * times in one file, `RoomInvite` twice (#226).
 *
 * **Which of them each screen can show is deliberately still the caller's
 * business**, and this component renders only what it is given. That is not
 * fastidiousness: `inviting` is state that outlives a route change, so a
 * version of this that always rendered the invite would pop the dialog back up
 * on the end-of-hand screen for anybody who had it open when the game ended.
 * The rulings are the other way round — a judged call routes the table to the
 * full view, so the two screens that never pass them could not show them
 * anyway.
 */
export interface AnnouncedCall {
  call: SunnyCalled;
  onDone: () => void;
}

export interface CaughtDialog {
  call: SunnyCalled;
  /** The play they were dodging, still in hand because the rewind left it. */
  skipped: Card[];
  owesPunishment: boolean;
  onDone: () => void;
}

export interface InvitePanel {
  code: string;
  underWay: boolean;
  screens: number;
  onClose: () => void;
}

export function TableOverlays({
  nameOf,
  explaining,
  onExplained,
  graduating = false,
  onGraduate,
  invite = null,
  announce = null,
  caught = null,
}: {
  nameOf: (playerId: string) => string;
  /** The Sunny Rule, taught to first-timers by having it happen to them. */
  explaining: boolean;
  onExplained: () => void;
  /**
   * The one question a first finished game asks. Armed by the event that ends
   * the game, so it has to be reachable from the screen that event lands on —
   * in landscape it once had nowhere at all to appear.
   */
  graduating?: boolean;
  onGraduate?: (keep: boolean) => void;
  invite?: InvitePanel | null;
  /** The ruling, for everyone but the seat it landed on. */
  announce?: AnnouncedCall | null;
  /** The punishment, for the seat it landed on. A dialog, never a banner (#66). */
  caught?: CaughtDialog | null;
}) {
  return (
    <>
      {announce ? (
        <SunnyAnnounce
          callerName={nameOf(announce.call.callerId)}
          targetName={nameOf(announce.call.targetId)}
          card={announce.call.card}
          correct={announce.call.correct}
          onDone={announce.onDone}
          ms={ANNOUNCE_MS}
        />
      ) : null}

      {caught ? (
        <SunnyCaught
          callerName={nameOf(caught.call.callerId)}
          skipped={caught.skipped}
          returned={caught.call.returned}
          owesPunishment={caught.owesPunishment}
          onDone={caught.onDone}
        />
      ) : null}

      {explaining ? <SunnyExplainer onDone={onExplained} /> : null}

      {/* Over the hand rather than docked into it, unlike the two pickers.
          Nothing here is a decision made by reading your cards against the
          board, so covering them costs nothing — and the landscape view is the
          one an IRL table is actually in when somebody walks up (#135). */}
      {invite ? (
        <RoomInvite
          code={invite.code}
          underWay={invite.underWay}
          screens={invite.screens}
          onClose={invite.onClose}
        />
      ) : null}

      {graduating && onGraduate ? <Graduation onChoose={onGraduate} /> : null}
    </>
  );
}
