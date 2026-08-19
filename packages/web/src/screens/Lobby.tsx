import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { BotSpeed, ClientMessage, RoomView } from "@goleta/engine";

import { dropIndex, hopsBetween, type SeatDrag } from "../lib/seatDrag.ts";
import { useDismissOnScreenJoin } from "../lib/sharedScreens.ts";
import { QrCode } from "../components/QrCode.tsx";
import {
  DealerPicker,
  describeDealing,
  describeRules,
  describeSeating,
  ShuffleSeatsToggle,
  HouseRulesPicker,
  IrlToggle,
} from "../components/HostSettings.tsx";
import { Button, Panel } from "../components/ui.tsx";
import { loadName } from "../net/identity.ts";
import { joinLink } from "../net/route.ts";

/**
 * How everyone else gets in: read it out, or text it.
 *
 * Four characters and a link, and nothing whose height depends on a switch
 * further down the screen. The QR used to live in here and grew out of the
 * middle of it, which pushed the copy button down the moment the host said the
 * table was in person — the answer landing above the question that caused it.
 * It has its own block now, under the switch. See `JoinQr`.
 */
function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = joinLink(code);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Room code</p>
      <p className="mt-1 font-mono text-5xl font-semibold tracking-[0.3em] text-amber-300">
        {code}
      </p>
      <Button variant="ghost" className="mt-1" onClick={() => void copy()}>
        {copied ? "Link copied" : "Copy invite link"}
      </Button>
    </div>
  );
}

/**
 * The thing you hold up across a table.
 *
 * Not a replacement for the code — getting five people to a table used to mean
 * saying four characters aloud and watching four people type them *and* the
 * URL, and this is a faster path to exactly the same place. Anyone seated can
 * show it, host or not: whoever is dealing usually will, but restricting it
 * buys nothing and costs the one person whose phone is nearest.
 *
 * **Only up at an in-person table**, because holding a phone up across one is
 * the whole of what it is for. For players who are somewhere else it is a
 * picture of a link they cannot point a camera at, taking the top third of the
 * lobby to say so.
 *
 * It sits directly under the switch that turns it on, which is why it is its own
 * block rather than part of `RoomCode` — a host who has just said "in person"
 * should see the QR appear below the tap, not above it.
 *
 * Sized to be scannable from the other side of a table without taking the lobby
 * over: the seat list is what people are actually watching once they're in.
 */
function JoinQr({ code }: { code: string }) {
  return (
    <div className="text-center">
      <div className="flex justify-center">
        <QrCode
          value={joinLink(code)}
          label={`Scan to join room ${code}`}
          className="w-44 max-w-[55%] p-2.5"
        />
      </div>
      <p className="mt-2 text-xs text-white/40">
        Point a camera at it, type the code, or tap it to copy the link.
      </p>
    </div>
  );
}

/**
 * The code for the screen in the middle of the table.
 *
 * **It says out loud that this one is for a different device**, because the
 * obvious move is the wrong one. Every other QR in this app is scanned with the
 * phone in your hand; this one is scanned by a spare tablet, an old phone or a
 * laptop that is about to be propped where the whole table can see it. Scanning
 * it with your own phone lands you on a board with no cards and takes you off
 * your seat, and a caption that only said "Add a shared screen" left that as
 * something to find out. The dialog says what to point at it before the camera
 * comes up.
 *
 * **And it takes itself away once one arrives** — `useDismissOnScreenJoin`,
 * which the in-game invite uses too so the two behave the same.
 */
function SharedScreenInvite({
  code,
  screens,
  onClose,
}: {
  code: string;
  /** How many shared screens are connected right now. */
  screens: number;
  onClose: () => void;
}) {
  const link = joinLink(code, "table");
  useDismissOnScreenJoin(screens, true, onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Add a shared screen"
      onClick={onClose}
    >
      <Panel className="w-full max-w-sm text-center" onClick={(event) => event.stopPropagation()}>
        <p className="text-sm font-semibold text-white">Scan this with a spare device</p>
        <p className="mt-1.5 text-xs leading-relaxed text-white/50">
          A tablet, an old phone, a laptop — something nobody is playing on. It shows the middle of
          the table, so stand it where everyone can see it.
        </p>
        <p className="mt-1 text-xs font-semibold text-amber-300/80">Not the phone in your hand.</p>
        <div className="mt-4 flex justify-center">
          <QrCode
            value={link}
            label={`Scan with a spare device to add a shared screen to room ${code}`}
            className="w-64 p-4"
          />
        </div>
        <p className="mt-2 text-xs text-white/40">Or tap the code to copy the link.</p>
        <Button variant="secondary" full className="mt-3" onClick={onClose}>
          Done
        </Button>
      </Panel>
    </div>
  );
}

const SPEEDS: { key: BotSpeed; label: string; blurb: string }[] = [
  { key: "human", label: "Human-like", blurb: "A few seconds a turn, like people play." },
  { key: "lightning", label: "Lightning", blurb: "As fast as the server can deal them." },
];

/**
 * The same sentence for the host, on the front of a drawer that is shut — plus
 * the bot pace, which is the other thing inside it that a table would notice.
 */
const describeTable = (room: RoomView, anyBots: boolean): string => {
  const said = [
    describeRules(room.houseRules),
    describeDealing(room.dealerMode),
    describeSeating(room.shuffleSeats),
  ];
  if (anyBots) {
    said.push(`Bots at ${room.botSpeed === "human" ? "human-like" : "lightning"} speed.`);
  }
  return said.filter(Boolean).join(" ");
};

/**
 * The settings drawer, shut on arrival.
 *
 * Most tables play the game as written and never open this; the ones that do
 * are being deliberate about it, and a tap is no obstacle to that. Shut, it is
 * one line saying what the table is playing — which is the part a host who
 * isn't changing anything actually wants, and it used to be four rows of
 * switches they had to read to work out.
 *
 * The state lives here, so every arrival at a lobby starts collapsed. That is
 * the intent rather than a side effect: a host who opened it last game was
 * changing something last game.
 *
 * It sits alone on its panel now that the IRL toggle leads the lobby, so it has
 * nothing above it to be divided from and keeps no rule of its own.
 *
 * The triangle is deliberately much larger than the label it sits beside. It is
 * the only thing on the row saying there is anything behind it, and at body-text
 * size it read as punctuation. "Advanced" rather than "expert" for the same
 * reason: most tables can leave this shut, and none of them need to have played
 * before to open it.
 *
 * It is a **disclosure** triangle — `◂` shut, `▾` open — and not the `▾`/`▴` pair
 * it started as. That pair is a scroll gesture, "more below / less below", and it
 * said nothing about the one thing this row is for. Shut, this points at the
 * label it will open; open, it points down the panel it opened. Drawn as one
 * glyph rotated rather than two, so the turn is the animation.
 *
 * Shut it points **left**, because the triangle is at the right-hand end of the
 * row and everything it is about is to its left: the label, the summary line,
 * and the panel that unfolds under them. It used to point `▸`, at the edge of
 * the card and nothing else (#137).
 */
function TableSettings({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">Advanced settings</span>
          <span className="block text-xs text-white/40">{summary}</span>
        </span>
        <span
          aria-hidden
          className={[
            "shrink-0 text-3xl leading-none text-white/60 transition-transform",
            open ? "-rotate-90" : "",
          ].join(" ")}
        >
          ◂
        </span>
      </button>
      {open ? <div className="mt-3 flex flex-col gap-3">{children}</div> : null}
    </div>
  );
}

/**
 * Only worth showing once there's a bot to pace. It's a table setting rather
 * than a personal one — the bots are timed on the server, so everyone watches
 * the same game.
 */
function BotSpeedPicker({
  speed,
  onPick,
}: {
  speed: BotSpeed;
  onPick: (speed: BotSpeed) => void;
}) {
  const chosen = SPEEDS.find((option) => option.key === speed);

  return (
    <div className="border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Bot speed</p>
      <div className="mt-2 flex gap-2">
        {SPEEDS.map((option) => (
          <Button
            key={option.key}
            variant={option.key === speed ? "primary" : "secondary"}
            className="flex-1"
            aria-pressed={option.key === speed}
            onClick={() => onPick(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/40">{chosen?.blurb}</p>
    </div>
  );
}

/**
 * Pointer events rather than HTML5 drag and drop, which does not exist on
 * touch. `touch-action: none` on the handle is what keeps the gesture from
 * scrolling the lobby instead, and pointer capture is what keeps it working
 * once the finger has left the row it started on. The arithmetic — and the
 * reasoning about why a drag is a run of `moveSeat` messages rather than a new
 * one — is in `lib/seatDrag.ts`.
 */

/**
 * Move this seat one place along the table.
 *
 * **The arrows stay**, and they are not a fallback: they are the keyboard path
 * and the precise one, and a drag handle is neither. The ends are disabled —
 * the server treats a move off either end as nothing happening, so a stale tap
 * costs an error banner nobody needed.
 */
function MoveSeat({
  name,
  first,
  last,
  onMove,
}: {
  name: string;
  first: boolean;
  last: boolean;
  onMove: (direction: "up" | "down") => void;
}) {
  const arrow = "min-h-0 size-8 shrink-0 px-0 py-0 text-xs";

  return (
    <span className="flex items-center gap-1">
      <Button
        variant="secondary"
        className={arrow}
        aria-label={`Move ${name} up`}
        disabled={first}
        onClick={() => onMove("up")}
      >
        ↑
      </Button>
      <Button
        variant="secondary"
        className={arrow}
        aria-label={`Move ${name} down`}
        disabled={last}
        onClick={() => onMove("down")}
      >
        ↓
      </Button>
    </span>
  );
}

/**
 * The grip a name is dragged by.
 *
 * Pointer-only, and `tabIndex={-1}` with `aria-hidden` because of it: the
 * arrows beside it do the same job from a keyboard and a screen reader, and a
 * focusable control that does nothing when you press Enter is worse than no
 * control at all. This is the shortcut for a host reordering eight names with a
 * thumb, not a second way of describing the list.
 *
 * `touch-none` is load-bearing. Without it a drag down the lobby is a scroll
 * down the lobby, which is the objection that kept this to two arrows in the
 * first place.
 */
function SeatGrip({
  dragging,
  onGrab,
  onDrag,
  onDrop,
}: {
  dragging: boolean;
  onGrab: (event: ReactPointerEvent<HTMLElement>) => void;
  onDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  onDrop: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onPointerDown={onGrab}
      onPointerMove={onDrag}
      onPointerUp={onDrop}
      onPointerCancel={onDrop}
      className={[
        "-ml-1 flex size-8 shrink-0 touch-none select-none items-center justify-center",
        "rounded-lg text-base leading-none transition-colors",
        dragging ? "cursor-grabbing text-white/70" : "cursor-grab text-white/25 hover:text-white/60",
      ].join(" ")}
    >
      ⠿
    </button>
  );
}

export function Lobby({
  room,
  playerId,
  send,
  onShowRules,
  onLeave,
}: {
  room: RoomView;
  playerId: string | null;
  send: (message: ClientMessage) => void;
  onShowRules: () => void;
  onLeave: () => void;
}) {
  const isHost = room.hostId === playerId;
  const enough = room.seats.length >= room.minPlayers;
  const tableFull = room.seats.length >= room.maxPlayers;
  const anyBots = room.seats.some((seat) => seat.bot);
  const winner = room.lastWinnerId
    ? room.seats.find((seat) => seat.id === room.lastWinnerId)
    : undefined;

  /**
   * Seat order is turn order in every room. It is only a table sitting in one
   * that has a real order for it to disagree with, so that is the only place
   * the arrows are worth the room they take — the numbers go out to everyone
   * there, host or not, because working out that the app deals across the table
   * is something the person sitting in the wrong place spots first.
   */
  const numbered = room.irl;
  const orderable = isHost && room.irl && room.seats.length > 1;

  /**
   * "Does the seat order look correct?", asked once, on the first deal into an
   * IRL room.
   *
   * A confirmation rather than a block, and a single line rather than an
   * explanation: getting it wrong is recoverable and getting it right is a
   * glance. Cleared by the deal it guards, so a table that has said yes is
   * never asked twice.
   *
   * Both answers say which one they are — "No, I'll fix it" and "Yes, let's
   * play". A pair of bare verbs made the reader work out which button meant no.
   */
  /**
   * The name currently under a finger, if any.
   *
   * The ref is the drag; the state is only so the row can look lifted. Every
   * hop is sent as it is crossed rather than held until the drop, which is what
   * makes the list reorder under the finger with no local copy of the order to
   * keep in step — the room's own `seats` is the only order there is.
   */
  const drag = useRef<SeatDrag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const endDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current = null;
    setDragging(null);
  };

  const grabSeat = (event: ReactPointerEvent<HTMLElement>, id: string, index: number): void => {
    if (!orderable) return;
    // Stops the press becoming a text selection, and on touch stops it becoming
    // the beginning of a scroll before `touch-action` has had its say.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, startY: event.clientY, from: index, at: index };
    setDragging(id);
  };

  const dragSeat = (event: ReactPointerEvent<HTMLElement>): void => {
    const state = drag.current;
    if (!state) return;
    // The seat left the room mid-drag. Let go rather than post hops about
    // somebody who is no longer at the table.
    if (!room.seats.some((seat) => seat.id === state.id)) {
      endDrag(event);
      return;
    }

    const want = dropIndex(state.from, event.clientY - state.startY, room.seats.length);
    const { direction, count } = hopsBetween(state.at, want);
    if (count === 0) return;

    // One message per place, exactly as the arrows send them.
    for (let hop = count; hop > 0; hop -= 1) {
      send({ t: "moveSeat", playerId: state.id, direction });
    }
    state.at = want;
  };

  const [checkingOrder, setCheckingOrder] = useState(false);
  const [orderChecked, setOrderChecked] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  // Turning IRL off, or losing a seat, takes the question away with it.
  const confirming = checkingOrder && room.irl && enough;

  const deal = (): void => {
    if (room.irl && !orderChecked) {
      setCheckingOrder(true);
      return;
    }
    send({ t: "start" });
  };

  const dealNow = (): void => {
    setOrderChecked(true);
    setCheckingOrder(false);
    send({ t: "start" });
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-5">
      <RoomCode code={room.code} />

      {winner ? (
        <Panel className="text-center">
          <p className="text-sm text-white/60">Last game</p>
          <p className="mt-1 text-lg font-semibold text-amber-300">
            {winner.name} kept the most cards
          </p>
        </Panel>
      ) : null}

      {/* Ahead of the names, because the answer decides how the rest of this
          screen — and every phone at the table — behaves. */}
      {isHost ? (
        <Panel>
          <IrlToggle on={room.irl} onChange={(on) => send({ t: "setIrl", on })} />
        </Panel>
      ) : null}

      {/* Directly under the switch that turns it on, and shown to everyone
          seated: the phone nearest the newcomer is the one that gets held up,
          and it isn't always the host's. */}
      {room.irl ? <JoinQr code={room.code} /> : null}

      <Panel>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-white">
            Players{" "}
            <span className="text-white/40">
              ({room.seats.length}/{room.maxPlayers})
            </span>
          </h2>
          {!enough ? (
            <span className="text-xs text-amber-300">needs {room.minPlayers}</span>
          ) : null}
        </div>

        {orderable ? (
          <p className="mt-1 text-xs text-white/40">
            Put these in the order you're sitting — drag a name, or use the arrows.
          </p>
        ) : null}

        <ul className="mt-3 space-y-1.5">
          {room.seats.map((seat, index) => (
            /*
              Held at the height of the tallest row rather than fitted to its own
              contents. The host's row is the one with no remove button on it, so
              nothing inside it reaches `Button`'s `min-h-11` and it came out
              24px shorter than every row under it — a list whose odd one out is
              the row belonging to whoever is reading the screen. `min-h-16` is
              that button plus the row's own padding, which is what the seats
              carrying controls already measure.
            */
            <li
              key={seat.id}
              className={[
                "flex min-h-16 items-center gap-2 rounded-xl px-3 py-2.5 text-sm",
                // Lifted rather than hidden: the row the finger is on is the
                // one that has to stay readable, because it is the one whose
                // number is changing.
                dragging === seat.id
                  ? "bg-white/15 ring-1 ring-amber-300/40"
                  : "bg-white/5",
              ].join(" ")}
            >
              {orderable ? (
                <SeatGrip
                  dragging={dragging === seat.id}
                  onGrab={(event) => grabSeat(event, seat.id, index)}
                  onDrag={dragSeat}
                  onDrop={endDrag}
                />
              ) : null}
              {numbered ? (
                <span className="w-4 shrink-0 text-xs tabular-nums text-white/30">{index + 1}</span>
              ) : null}
              {/* Shrinks before the controls do: a long name in an IRL room
                  shares the row with a remove button and two arrows. */}
              <span className="min-w-0 truncate font-medium text-white">{seat.name}</span>
              {seat.isHost ? (
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-300">
                  host
                </span>
              ) : null}
              {seat.bot ? (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] text-white/60">
                  bot
                </span>
              ) : null}
              {seat.id === playerId ? <span className="text-xs text-white/40">you</span> : null}
              {!seat.connected && !seat.bot ? (
                <span className="text-xs text-white/40">away</span>
              ) : null}
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {isHost && seat.id !== room.hostId ? (
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => send({ t: "removeSeat", playerId: seat.id })}
                  >
                    remove
                  </Button>
                ) : null}
                {orderable ? (
                  <MoveSeat
                    name={seat.name}
                    first={index === 0}
                    last={index === room.seats.length - 1}
                    onMove={(direction) => send({ t: "moveSeat", playerId: seat.id, direction })}
                  />
                ) : null}
              </span>
            </li>
          ))}

          {/* Last in the list, because the end of the list is where the bot it
              adds turns up: the server pushes new seats onto the end. */}
          {isHost ? (
            <li>
              <Button
                variant="ghost"
                full
                className="justify-start rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-white/60 hover:border-white/25"
                onClick={() => send({ t: "addBot" })}
                disabled={tableFull}
              >
                <span aria-hidden>+</span> Add a bot
              </Button>
            </li>
          ) : null}
          {/* A row per screen that is actually connected, above the button that
              invites the next one — the same order the seats and "Add a bot"
              are in. Rows rather than a tally because a screen arriving should
              be something appearing in the room, and there is more than one on
              offer: a long table may want one at each end (#138). */}
          {room.irl
            ? Array.from({ length: room.tableScreens }, (_, index) => (
                <li
                  key={`shared-screen-${index}`}
                  className="flex min-h-16 items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm"
                >
                  {numbered ? (
                    // Sits in the seats' number column and stays empty: a shared
                    // screen holds no seat, so it takes no place in the turn
                    // order and must not look like it does.
                    <span aria-hidden className="w-4 shrink-0" />
                  ) : null}
                  <span className="min-w-0 truncate font-medium text-white">Shared screen</span>
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-300">
                    connected
                  </span>
                </li>
              ))
            : null}
          {room.irl ? (
            <li>
              <Button
                variant="ghost"
                full
                className="justify-start rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-white/60 hover:border-white/25"
                onClick={() => setSharingScreen(true)}
              >
                <span aria-hidden>+</span>{" "}
                {room.tableScreens > 0 ? "Add another shared screen" : "Add a shared screen"}
              </Button>
            </li>
          ) : null}
        </ul>
      </Panel>

      {sharingScreen ? (
        <SharedScreenInvite
          code={room.code}
          screens={room.tableScreens}
          onClose={() => setSharingScreen(false)}
        />
      ) : null}

      {isHost ? (
        <>
          {/* On its own, under the names it needs four of. It shared a row with
              "Add a bot" and sat above the settings, which gave equal weight to
              the button a table presses once and the one it presses never. */}
          {confirming ? (
            <Panel>
              <p className="text-sm font-semibold text-white">
                Does the seat order look correct?
              </p>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1" onClick={() => setCheckingOrder(false)}>
                  No, I'll fix it
                </Button>
                <Button variant="primary" className="flex-1" onClick={dealNow}>
                  Yes, let's play
                </Button>
              </div>
            </Panel>
          ) : (
            <Button
              variant="primary"
              full
              className="py-3.5 text-base"
              onClick={deal}
              disabled={!enough}
            >
              Continue
            </Button>
          )}

          <Panel>
            <TableSettings summary={describeTable(room, anyBots)}>
              <HouseRulesPicker
                rules={room.houseRules}
                onChange={(rules) => send({ t: "setHouseRules", rules })}
              />
              {/* A room setting rather than a house rule — `startGame` takes a
                  dealer index and has never cared how it was chosen — but it is
                  read at the same moment as the switches above, so it belongs
                  beside them rather than beside bot speed, which is read live
                  and is the one thing here that really is between-games-only. */}
              <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
                <DealerPicker
                  mode={room.dealerMode}
                  onChange={(mode) => send({ t: "setDealerMode", mode })}
                />
                {/* Beside the dealer and independent of it: that one changes
                    who deals, this one changes who follows whom. In an IRL room
                    it is also what puts the "take your seat" screen up, which
                    is the half of it that does the work (#199). */}
                <ShuffleSeatsToggle
                  on={room.shuffleSeats}
                  irl={room.irl}
                  onChange={(on) => send({ t: "setShuffleSeats", on })}
                />
              </div>
              {anyBots ? (
                <BotSpeedPicker
                  speed={room.botSpeed}
                  onPick={(speed) => send({ t: "setBotSpeed", speed })}
                />
              ) : null}
            </TableSettings>
          </Panel>
        </>
      ) : (
        <Panel className="text-center text-sm text-white/60">
          Waiting for {room.seats.find((seat) => seat.isHost)?.name ?? "the host"} to deal.
          {room.irl ? (
            <span className="mt-1 block text-xs text-white/40">
              Everyone's in the same room — turn your phone sideways when the cards come out.
            </span>
          ) : null}
          <span className="mt-1 block text-xs text-white/40">{describeRules(room.houseRules)}</span>
          {/* Visible to the whole table, not only the host: who deals is not a
              secret, and it decides who opens. Silent when the deal rotates,
              which is the convention and the default. */}
          {describeDealing(room.dealerMode) ? (
            <span className="mt-1 block text-xs text-white/40">
              {describeDealing(room.dealerMode)}
            </span>
          ) : null}
          {/* Seat order is turn order, so this is one everybody at the table
              wants to know before the cards come out rather than after. */}
          {describeSeating(room.shuffleSeats) ? (
            <span className="mt-1 block text-xs text-white/40">
              {describeSeating(room.shuffleSeats)}
            </span>
          ) : null}
          {anyBots ? (
            <span className="mt-1 block text-xs text-white/40">
              Bots play at {room.botSpeed === "human" ? "human-like" : "lightning"} speed.
            </span>
          ) : null}
          {playerId === null ? (
            <div className="mt-4 border-t border-white/10 pt-4">
              <Button
                variant="primary"
                onClick={() =>
                  send({
                    t: "join",
                    code: room.code,
                    name: loadName() || "Watcher",
                  })
                }
                disabled={room.seats.length >= room.maxPlayers}
              >
                {room.seats.length >= room.maxPlayers ? "Table is full" : "Join table"}
              </Button>
            </div>
          ) : null}
        </Panel>
      )}

      <div className="mt-auto flex justify-between pt-2">
        <Button variant="ghost" onClick={onShowRules}>
          How to play
        </Button>
        <Button variant="ghost" onClick={onLeave}>
          Leave
        </Button>
      </div>
    </div>
  );
}
