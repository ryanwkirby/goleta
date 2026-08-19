import type { ClientMessage, RoomView } from "@goleta/engine";

import { HostSettingsCog } from "../../components/HostSettings.tsx";
import { PlayerSettingsCog } from "../../components/PlayerSettings.tsx";
import { QrGlyph } from "../../components/QrCode.tsx";
import { Button } from "../../components/ui.tsx";

/**
 * The row of small grey print across the top of the upright table.
 *
 * Two cogs, the way in, whether the socket is up, and the two ways out. It is
 * the upright view's only header — `HandView` has none at all, which is why the
 * cog and the rules link have to be reachable from the peek strip as well
 * (#194, #195).
 */
export function TableHeader({
  room,
  isHost,
  seated,
  hints,
  onChooseHints,
  offline,
  send,
  onShowInvite,
  onShowRules,
  onLeave,
}: {
  room: RoomView;
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
}) {
  return (
    <header className="flex items-center gap-2 text-xs text-white/50">
      {/* Yours first, the host's second, and the two are legible as
          different things: a person and a gear, an inch apart, one of which
          changes the game for everybody (#188). A watcher gets neither —
          the only thing in this drawer is about your own cards. */}
      {seated ? (
        <PlayerSettingsCog
          hints={hints}
          onHints={onChooseHints}
          className="-ml-2"
        />
      ) : null}
      {/* Beside the player's, not in place of it, because it is the host's way
          back to everything the lobby held and the rest of this line is
          facts about the room rather than things to press. What used to sit
          at the far end was a lone `in person: on` button — the only host
          control that survived the lobby, reading like a status somebody
          had left switched on. It lives behind the cog now, with the rules
          for the next deal beside it (#134). */}
      {isHost ? (
        <HostSettingsCog
          rules={room.houseRules}
          irl={room.irl}
          dealerMode={room.dealerMode}
        shuffleSeats={room.shuffleSeats}
          onRules={(rules) => send({ t: "setHouseRules", rules })}
          onIrl={(on) => send({ t: "setIrl", on })}
          onDealerMode={(dealer) => send({ t: "setDealerMode", mode: dealer })}
        onShuffleSeats={(on) => send({ t: "setShuffleSeats", on })}
          // Pulled back over the column's own padding only when it leads
          // the row. With the player's cog before it there is nothing to
          // pull back over. The row was already this tall — `rules` and
          // `leave` are `Button`s, and every `Button` is `min-h-11` — so
          // neither target costs the header anything.
          className={seated ? "" : "-ml-2"}
        />
      ) : null}
      {/* The code was four characters saying what the room was called and
          doing nothing, which is the whole of what a code is for when
          there is no lobby left to go back to. Tapping it is the invite —
          a person or a shared screen, same room, different link (#135).
          Anybody may open it: handing somebody the way in is not a host
          power, and nothing behind it changes the room.

          It is a glyph rather than the four characters since #162. The
          panel leads with the code at reading-out size, so during a hand
          the characters were furniture: this says *there is a way in here*
          and the way in says the rest. */}
      <button
        type="button"
        aria-label={`Invite to room ${room.code}`}
        aria-haspopup="dialog"
        title={`Invite to room ${room.code}`}
        onClick={onShowInvite}
        className={[
          "-m-1 flex shrink-0 items-center rounded-lg p-1 text-base text-white/70",
          "transition-colors hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        ].join(" ")}
      >
        <QrGlyph />
      </button>
      {offline ? <span className="text-amber-300">· reconnecting…</span> : null}
      {/* No way back to the hand here, and none needed: at an IRL table the
          phone is the toggle. Turning it sideways is the hand view and
          turning it upright is this one — a gesture the table can see you
          make, which two words in a corner never were. */}
      <Button variant="ghost" className="ml-auto px-2 py-1 text-xs" onClick={onShowRules}>
        rules
      </Button>
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onLeave}>
        leave
      </Button>
    </header>
  );
}
