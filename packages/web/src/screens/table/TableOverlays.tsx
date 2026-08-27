import type { Card } from "@goleta/engine";

import { Graduation } from "../../components/Help.tsx";
import { RoomInvite } from "../../components/RoomInvite.tsx";
import { SunnyAnnounce } from "../../components/sunny/SunnyAnnounce.tsx";
import { SunnyCaught } from "../../components/sunny/SunnyCaught.tsx";
import { SunnyExplainer } from "../../components/sunny/SunnyExplainer.tsx";
import { ANNOUNCE_MS } from "../../lib/beats.ts";
import type { SunnyCalled } from "../../lib/judgedCall.ts";
import type { CaughtNarration } from "../../lib/sunnyOffer.ts";

/**
 * Everything the table draws *over* itself: a ruling, a punishment, an
 * explanation, an invite, and the one question a first finished game asks. Three
 * screens could each carry some of these and every one wrote out its own copy
 * (#226).
 *
 * **Which of them each screen can show is still the caller's business.**
 * `inviting` is state that outlives a route change, so a version that always
 * rendered the invite would pop the dialog back up on the end-of-hand screen for
 * anybody who had it open when the game ended.
 */
export interface AnnouncedCall {
  call: SunnyCalled;
  onDone: () => void;
}

export interface CaughtDialog {
  call: SunnyCalled;
  /** The play they were dodging, still in hand because the rewind left it. */
  skipped: Card[];
  /** Which offence and which third step, decided in `lib/sunnyOffer.ts` (#363). */
  narration: CaughtNarration;
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
  /** Armed by the event that ends the game, so it has to be reachable from the
   * screen that event lands on — in landscape it once had nowhere to appear. */
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
          narration={caught.narration}
          owesPunishment={caught.owesPunishment}
          nameOf={nameOf}
          onDone={caught.onDone}
        />
      ) : null}

      {explaining ? <SunnyExplainer onDone={onExplained} /> : null}

      {/* Over the hand rather than docked into it, unlike the two pickers: nothing
          here is a decision made by reading your cards against the board, so
          covering them costs nothing (#135). */}
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
