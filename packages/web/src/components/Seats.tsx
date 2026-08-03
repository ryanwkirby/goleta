import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { GameView, PlayerView, RoomView } from "@goleta/engine";

import { fanTable, inRows } from "../lib/fan.ts";
import { inTurnOrder } from "../lib/seating.ts";
import { cardAnchor, seatAnchor } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import type { Shout } from "../net/useGoleta.ts";
import { CARD_WIDTH_PX, PlayingCard } from "./Card.tsx";
import { HelpShout } from "./Help.tsx";
import { SunnySign } from "./Sunny.tsx";

const nameFor = (room: RoomView, id: string): string =>
  room.seats.find((seat) => seat.id === id)?.name ?? "Player";

/**
 * The sun belongs to whoever a call would land on, wherever the turn has got
 * to — not to whoever is playing. Those are the same seat right up until the
 * drawer plays and the turn moves on with the window still open, and following
 * the target through that is what keeps the icon pointing at the right head.
 *
 * No target, no sun. On screen it means one thing: you could accuse them.
 */
const sunFor = (game: GameView, playerId: string): "callable" | "telling" | null => {
  if (!game.sunnyCallable || game.sunnyTargetId !== playerId) return null;
  return game.sunnyWouldLand ? "telling" : "callable";
};

function Seat({
  player,
  room,
  game,
  shouting,
  rows,
  onCallSunny,
}: {
  player: PlayerView;
  room: RoomView;
  game: GameView;
  shouting: boolean;
  /** How many rows this hand takes at the strip's shared sliver. */
  rows: number;
  onCallSunny: () => void;
}) {
  const { anchor, isArriving } = useMotion();
  const onClock = game.waitingOn === player.id;
  const out = player.eliminated;
  const sun = sunFor(game, player.id);

  return (
    <li
      ref={anchor(seatAnchor(player.id))}
      data-seat={player.id}
      className={[
        "relative min-w-32 shrink-0 rounded-xl px-3 py-2 ring-1 transition-colors",
        onClock ? "bg-amber-400/15 ring-amber-300/60" : "bg-black/20 ring-white/10",
        out ? "opacity-45" : "",
      ].join(" ")}
    >
      {/* Somebody asking for a hand, said out loud over their own cards. */}
      {shouting ? <HelpShout name={nameFor(room, player.id)} /> : null}

      <div className="flex items-baseline gap-2">
        <span className="truncate text-sm font-semibold text-white">
          {nameFor(room, player.id)}
        </span>
        {sun ? (
          <SunnySign
            state={sun}
            targetName={nameFor(room, player.id)}
            onCall={onCallSunny}
            className="self-center"
          />
        ) : null}
        <span
          className={[
            "ml-auto font-mono text-sm tabular-nums",
            player.cardCount <= 2 && !out ? "text-rose-300" : "text-white/60",
          ].join(" ")}
        >
          {out ? "out" : player.cardCount}
        </span>
      </div>

      {/* Deliberately no highlight on what they could play — working that out
          is the other half of the Sunny Rule. */}
      <div className="mt-1.5 flex flex-col gap-1">
        {inRows(player.hand, rows).map((row) => (
          // Cards slide left onto their neighbours by `--fan`, which the strip
          // sets once for the whole table. What each one keeps is its top-left
          // corner — rank over glyph, where the face already puts them — and the
          // last in the row shows whole. Later cards paint over earlier ones by
          // DOM order alone, so no `z-index` is needed or wanted.
          //
          // The elements keep their full `h-14 w-10` box, shifted rather than
          // shrunk or clipped: `resolveAnchor` reads these rects to decide where
          // a flight starts and lands, so a card that is half-covered is still a
          // whole card as far as the motion layer is concerned.
          <div key={row[0].id} className="flex [&>*+*]:ml-[var(--fan)]">
            {row.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                size="sm"
                anchor={anchor(cardAnchor(card.id))}
                arriving={isArriving(card.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </li>
  );
}

export function Seats({
  room,
  game,
  shouts,
  onCallSunny,
}: {
  room: RoomView;
  game: GameView;
  shouts: Shout[];
  onCallSunny: () => void;
}) {
  const others = inTurnOrder(game);
  const shouting = new Set(shouts.map((shout) => shout.playerId));
  const strip = useRef<HTMLUListElement>(null);
  const { reduced } = useMotion();

  /**
   * How much room the seats have between them, measured rather than assumed.
   *
   * The overlap is a table-wide decision — one sliver for everybody — so it
   * needs the strip's width and every hand's size at once, which is here and
   * nowhere else. `contentRect` is the strip's box inside its own padding,
   * which is exactly the width the seats have to fit across.
   *
   * The caution about offsets rather than bounding boxes belongs to the
   * scroll-centring below, where a card mid-flight could poison a measurement.
   * Nothing is in flight across the strip's own border box.
   *
   * Rounded down, so a fractional resize that changes nothing anybody can see
   * doesn't re-render the table.
   */
  const [available, setAvailable] = useState(0);
  useLayoutEffect(() => {
    const list = strip.current;
    if (!list) return;
    const watch = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(Math.floor(entry.contentRect.width));
    });
    watch.observe(list);
    return () => watch.disconnect();
  }, []);

  const fan = fanTable(
    available,
    others.map((player) => player.hand.length),
  );

  /**
   * One rule for where the strip sits: show whoever the table is waiting on,
   * whole.
   *
   * Eight seats don't fit on a phone, and having to go looking for the person
   * playing — every turn, all game — was the single most tiring thing about
   * watching a full table. `waitingOn` rather than the turn, so it also follows
   * somebody who owes a card for a call that missed: that is exactly the moment
   * you want to be looking at them.
   *
   * On your own turn there is nobody in the strip to follow, so it goes hard
   * left — which, rotated, is the player about to follow you, and exactly who
   * you're weighing up while you decide.
   *
   * Otherwise the seat is centred, but never at the price of hanging one of its
   * ends off an edge: the first seat settles at `0` and the last at the end of
   * the scroll. Centring alone got that wrong for any seat wider than the strip
   * — `clientWidth - offsetWidth` goes negative and the "centre" lands *inside*
   * the seat, showing its middle with both ends cut off, and low enough that
   * the clamp to the far end never fired. A seat too wide to show whole gets
   * its start instead of its middle.
   *
   * Scrolls by arithmetic on the strip rather than `scrollIntoView`, which is
   * free to scroll every ancestor it can find and would yank the page about
   * underneath you. Offsets, not bounding boxes, so a card mid-flight can't
   * poison the measurement — which is why the strip is `relative`: it makes
   * itself the offset parent, so a seat's `offsetLeft` is its place in the
   * strip rather than its place on the page.
   *
   * Seats change width as hands grow and as the fan tightens under them, so the
   * layout is a dependency too: whoever the table is waiting on has to end up
   * centred against the widths as they finally settle, not the ones they had
   * before the last resize.
   */
  const waitingOn = game.waitingOn;
  const you = game.you;
  const settled = `${fan.sliver}:${fan.rows.join(",")}`;
  useEffect(() => {
    const list = strip.current;
    if (!list || waitingOn === null) return;

    const end = Math.max(0, list.scrollWidth - list.clientWidth);
    let left = 0;

    if (waitingOn !== you) {
      const seat = list.querySelector<HTMLElement>(`[data-seat="${waitingOn}"]`);
      if (!seat) return;
      const centred = seat.offsetLeft - (list.clientWidth - seat.offsetWidth) / 2;
      const showingItsStart = seat.offsetLeft;
      const showingItsEnd = seat.offsetLeft + seat.offsetWidth - list.clientWidth;
      const wanted = Math.min(Math.max(centred, showingItsEnd), showingItsStart);
      left = Math.min(Math.max(wanted, 0), end);
    }

    if (Math.abs(left - list.scrollLeft) < 1) return;
    // A hidden tab runs no animation frames, and a smooth scroll asked for
    // there is dropped rather than deferred — you'd come back to a table still
    // showing the wrong seat. Nobody is watching it glide, so don't ask it to.
    const gliding = !reduced && document.visibilityState === "visible";
    list.scrollTo({ left, behavior: gliding ? "smooth" : "auto" });
  }, [waitingOn, you, reduced, settled]);

  return (
    <ul
      ref={strip}
      // One overlap for the entire strip, handed down from here: cards read
      // identically in every hand, and somebody holding three isn't squashed
      // differently from somebody holding twenty. It's the shift from one card
      // to the next — the 4px gap the seats always had, once the hands are wide
      // enough to need it, and negative from there on.
      style={{ "--fan": `${fan.sliver - CARD_WIDTH_PX.sm}px` } as CSSProperties}
      // The padding is for the turn ring. A ring is drawn outside the border
      // box, and a box that clips one axis clips both, so without room to draw
      // in the ring was trimmed off the top of every seat and off the side of
      // the first and last ones at the scroll extremes. Same fix as `Hand.tsx`
      // uses to keep a lifted card from being cut off.
      className="relative flex gap-2 overflow-x-auto p-1"
      aria-label="Other players"
    >
      {others.map((player, seat) => (
        <Seat
          key={player.id}
          player={player}
          room={room}
          game={game}
          shouting={shouting.has(player.id)}
          rows={fan.rows[seat] ?? 1}
          onCallSunny={onCallSunny}
        />
      ))}
    </ul>
  );
}
