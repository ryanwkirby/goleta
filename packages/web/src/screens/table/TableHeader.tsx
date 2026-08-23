import type { ClientMessage, PlayerId, RoomView } from "@goleta/engine";

import { LeaveControl } from "../../components/Leave.tsx";
import { SunnyCall } from "../../components/sunny/SunnyCall.tsx";
import { QrGlyph } from "../../components/QrCode.tsx";
import { SettingsCog } from "../../components/Settings.tsx";
import { headerItem } from "../../components/ui.tsx";

/** The open book, drawn to match the cog, the QR and the door. An emoji among
 * drawn glyphs is what #296 took out of the cog, and this row is now four of
 * them side by side. */
function BookGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M12 7.2v12.3" />
      <path d="M12 7.2C10.4 5.8 8.4 5 6 5H3.5v12.3H6c2.4 0 4.4.8 6 2.2" />
      <path d="M12 7.2C13.6 5.8 15.6 5 18 5h2.5v12.3H18c-2.4 0-4.4.8-6 2.2" />
    </svg>
  );
}

/**
 * The row across the top of the upright table: settings, the way in, whether the
 * socket is up, the rules and the way out. It is the upright view's only header —
 * `HandView` has none, which is why the cog and the rules link have to be
 * reachable from the peek strip as well (#194, #195).
 *
 * **Four icons with a word under each** (#330). It was two glyphs, a word and a
 * picture of a door, all in the same small grey print, and nothing in it said
 * which of them were the same kind of thing. Every item already cleared 44px, so
 * the target was never what was missing — legibility was.
 *
 * `settings · join` lead and `rules · leave` sit at the far end, which keeps the
 * way out at the edge and leaves the middle of the row clear. The word is what
 * makes the row taller, and what pays for it is the felt between the seat strip
 * and the piles: that block is `flex-1` and `justify-center`, so it gives up the
 * few pixels and the cards are untouched.
 *
 * The words are one each and nothing else joins them. **Landscape is not
 * this**: the peek strip's left cluster is the only part of that row allowed to
 * take width, and words there would push the pile onto a second line.
 */
export function TableHeader({
  room,
  me,
  isHost,
  seated,
  hints,
  onChooseHints,
  offline,
  send,
  onShowInvite,
  onShowRules,
  onLeave,
  sunnyTargetName,
  lockedReaches,
  onStartAccusing,
}: {
  room: RoomView;
  /** Whose header this is, for the seat-shaped settings in the cog. */
  me: PlayerId | null;
  isHost: boolean;
  /** A watcher gets no cog: the only thing in that drawer is about your cards. */
  seated: boolean;
  hints: boolean;
  onChooseHints: (on: boolean) => void;
  offline: boolean;
  send: (message: ClientMessage) => void;
  onShowInvite: () => void;
  onShowRules: () => void;
  onLeave: () => void;
  /** Who a call would be against, or null when no window is open. There is only
   * ever one, which is what lets the control name them (#189). */
  sunnyTargetName: string | null;
  /** Reaches left before you may call again. Visible only to you (#50). */
  lockedReaches: number;
  onStartAccusing: () => void;
}) {
  return (
    <header className="flex items-center gap-2 text-xs text-white/50">
      {/* One cog, with a *yours* section inside it and the host's below that
          (#253). It used to be two doors an inch apart, and the personal one held
          a single control that is also the last thing on the rules screen — which
          **rules**, two words along this same row, already opens. The rest of
          this line is facts about the room rather than things to press. What used
          to sit at the far end was a lone `in person: on` button, reading like a
          status somebody had left switched on (#134). */}
      {seated ? (
        <SettingsCog
          label="settings"
          isHost={isHost}
          hints={hints}
          onHints={onChooseHints}
          autopilot={room.seats.find((seat) => seat.id === me)?.autopilot ?? "off"}
          onAutopilot={(mode) => send({ t: "setAutopilot", mode })}
          rules={room.houseRules}
          irl={room.irl}
          dealerMode={room.dealerMode}
          shuffleSeats={room.shuffleSeats}
          onRules={(rules) => send({ t: "setHouseRules", rules })}
          onIrl={(on) => send({ t: "setIrl", on })}
          onDealerMode={(mode) => send({ t: "setDealerMode", mode })}
          onShuffleSeats={(on) => send({ t: "setShuffleSeats", on })}
          // Pulled back over the column's own padding: it leads the row.
          className="-ml-2"
        />
      ) : null}
      {/* The code was four characters saying what the room was called and doing
          nothing. Tapping it is the invite — a person or a shared screen, same
          room, different link (#135) — and anybody may open it. A glyph rather
          than the characters since #162: the panel leads with the code at
          reading-out size, so this says *there is a way in here*. */}
      <button
        type="button"
        aria-label={`Invite to room ${room.code}`}
        aria-haspopup="dialog"
        title={`Invite to room ${room.code}`}
        onClick={onShowInvite}
        className={headerItem}
      >
        {/* Sized to the other three by the one dial `QrGlyph` has: it is drawn at
            `1em`, and the `em` here is the word underneath it rather than the
            20px the three drawn glyphs are. */}
        <span className="text-[1.25rem] leading-none">
          <QrGlyph />
        </span>
        <span>join</span>
      </button>
      {offline ? <span className="text-amber-300">· reconnecting…</span> : null}

      {/*
        The way into a call, top centre (#329). It was pinned over the felt just
        above your own cards, and it appears and disappears on **every draw** —
        which is most turns of most games — so it was the one thing on the screen
        that moved when the phone was turned and flickered in and out where the
        eye was on the cards.

        #189's constraint is *away from the draw pile*, and it was written about
        the sun drawn immediately before the deck. This is the full height of the
        column away from the piles, which satisfies it with room to spare.

        **The slot is reserved whether or not the offer is in it**: `flex-1` takes
        the row's slack either way, so the four controls beside it do not reflow
        when a window opens. Same reasoning as the `min-h-7` line above the hand,
        which is kept clear for the same reason (#131).

        Only the offer moved. The missed-call count — yours alone — and the offer
        of help stay on the line above the cards.
      */}
      <div className="flex min-w-0 flex-1 justify-center">
        {sunnyTargetName !== null ? (
          <SunnyCall
            targetName={sunnyTargetName}
            lockedReaches={lockedReaches}
            onCall={onStartAccusing}
          />
        ) : null}
      </div>

      {/* No way back to the hand here, and none needed: at an IRL table the phone
          is the toggle, and turning it is a gesture the table can see you make. */}
      <button
        type="button"
        aria-label="How to play"
        title="How to play"
        onClick={onShowRules}
        className={headerItem}
      >
        <BookGlyph />
        <span>rules</span>
      </button>
      {/* A door rather than the word it was (#255). Two small grey words an inch
          apart, one of which opens a panel and one of which drops you out of the
          game, and the second fired instantly. It asks first now, and the copy
          says what leaving actually costs. */}
      <LeaveControl
        compact
        label="leave"
        watching={!seated}
        underWay={room.status === "playing"}
        onLeave={onLeave}
        className="-mr-2"
      />
    </header>
  );
}
