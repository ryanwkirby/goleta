import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from "react";

import type { GameView, PlayerView, RoomView, ShoutKind } from "@goleta/engine";

import { fanTable, inRows, type SeatHand } from "../lib/fan.ts";
import { inTurnOrder, nextStillIn } from "../lib/seating.ts";
import { cardAnchor, seatAnchor } from "../lib/anchors.ts";
import { useMotion } from "../lib/motion.ts";
import type { Shout } from "../lib/feed.ts";
import { PlayingCard } from "./Card.tsx";
import { CARD_WIDTH_PX } from "../lib/cardShape.ts";
import { HelpShout, HintedMark, shoutingNow } from "./Help.tsx";

const nameFor = (room: RoomView, id: string): string =>
  room.seats.find((seat) => seat.id === id)?.name ?? "Player";

/**
 * A seat that has run out of cards, collapsed to its name (#192).
 *
 * It used to keep a full-width seat for the rest of the game — `SEAT_MIN` is
 * 128px — faded to `opacity-45` with the word *out* where the count goes. At a
 * table of eight, late on, the hands that still mattered were competing for
 * width with three seats holding nothing, in a strip whose whole job is showing
 * hands you can read.
 *
 * It is still on screen and still named, which is the honest half of the old
 * rule: they are still at the table. What goes is the width, and with it the
 * word — a chip this size, faded, at the end of the strip, is not somewhere
 * anybody looks for a card count. The word survives for a screen reader, which
 * has no fade and no position to read it off.
 *
 * No sun and no shout. Neither can happen to somebody with no hand: a call is
 * about a draw, and the offer of help is about a turn.
 */
function OutSeat({
  playerId,
  name,
  seatRef,
}: {
  playerId: string;
  name: string;
  seatRef: RefCallback<HTMLElement>;
}) {
  return (
    <li
      ref={seatRef}
      data-seat={playerId}
      title={`${name} is out`}
      className={[
        // `min-w-20` is the number `SEAT_OUT_MIN` in `fan.ts` is holding a
        // place for; keep the two in step. A longer name grows it, exactly as a
        // longer name already grows a live seat past `min-w-32`.
        "flex min-w-20 shrink-0 items-center rounded-xl bg-black/20 px-3 py-2 text-sm",
        "font-semibold text-white opacity-45 ring-1 ring-white/10",
      ].join(" ")}
    >
      {name}
      <span className="sr-only"> is out</span>
    </li>
  );
}

/**
 * A seat, its name, its count and its hand.
 *
 * **No sun.** There used to be one wedged between the name and the count for
 * whoever a call would land on — 20px of it, in a strip that scrolls sideways,
 * for the most time-critical control in the app. It has left the seat entirely
 * (#189): there is only ever one target, so the control names them instead, and
 * that is what stops a call being a thing you do to a name in a list.
 */
function Seat({
  player,
  room,
  game,
  shouting,
  rows,
}: {
  player: PlayerView;
  room: RoomView;
  game: GameView;
  /** What this seat is saying out loud right now, if anything. */
  shouting: ShoutKind | undefined;
  /** How many rows this hand takes at the strip's shared sliver. */
  rows: number;
}) {
  const { anchor, isArriving } = useMotion();
  const onClock = game.waitingOn === player.id;
  const out = player.eliminated;
  const hinted = room.seats.find((seat) => seat.id === player.id)?.hinted ?? false;

  // Kept even for a seat with nothing left to fly to it: the anchor is how the
  // motion layer knows where this seat is, and a `data-seat` is how the strip
  // finds one to scroll to. Neither wants a hole in it.
  const seatRef = anchor(seatAnchor(player.id));

  if (out) {
    return <OutSeat playerId={player.id} name={nameFor(room, player.id)} seatRef={seatRef} />;
  }

  return (
    <li
      ref={seatRef}
      data-seat={player.id}
      className={[
        "relative min-w-32 shrink-0 rounded-xl px-3 py-2 ring-1 transition-colors",
        onClock ? "bg-amber-400/15 ring-amber-300/60" : "bg-black/20 ring-white/10",
      ].join(" ")}
    >
      {/* Somebody asking for a hand — or saying they have switched the
          highlights on — said out loud over their own cards. */}
      {shouting ? <HelpShout name={nameFor(room, player.id)} kind={shouting} /> : null}

      <div className="flex items-baseline gap-2">
        {/* No `truncate`: at ten characters the longest name anybody can have
            is under 90px at this size, and the seat grows to hold it — the
            strip already scrolls, which #59 settled as the acceptable cost of
            fitting a table on a phone. Clipping a name to save a few pixels of
            scroll was the wrong side of that trade (#161). */}
        <span className="text-sm font-semibold text-white">{nameFor(room, player.id)}</span>
        {/* The standing half of the #33 bargain: taking help is never quiet, so
            for as long as somebody is playing with their cards marked up, the
            table can see that they are. Not a verdict and not a tell — it says
            nothing about their hand, only about their screen. */}
        {hinted ? <HintedMark name={nameFor(room, player.id)} className="self-center text-xs" /> : null}
        <span
          className={[
            "ml-auto font-mono text-sm tabular-nums",
            player.cardCount <= 2 ? "text-rose-300" : "text-white/60",
          ].join(" ")}
        >
          {player.cardCount}
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
                mirrored={room.irl}
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
}: {
  room: RoomView;
  game: GameView;
  shouts: Shout[];
}) {
  const others = inTurnOrder(game);
  const shouting = shoutingNow(shouts);
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

  /**
   * What each seat costs the strip. An eliminated seat is `"out"` rather than a
   * hand of zero — `seatWidth(0, …)` is `SEAT_MIN`, a full 128px, and reserving
   * that for a name chip would tighten everybody else's cards to pay for a seat
   * that is no longer drawn as one.
   *
   * Keyed on `eliminated` and not on an empty hand, which is the same thing in
   * this game and is the same thing for one reason rather than by construction.
   */
  const held: SeatHand[] = others.map((player) =>
    player.eliminated ? "out" : player.hand.length,
  );
  const fan = fanTable(available, held);

  /**
   * One rule for where the strip sits: show whoever the table is waiting on,
   * whole.
   *
   * Eight seats don't fit on a phone, and having to go looking for the person
   * playing — every turn, all game — was the single most tiring thing about
   * watching a full table. `waitingOn` rather than the turn, so it also follows
   * somebody who has been caught and owes a punishment card: that is exactly
   * the moment you want to be looking at them.
   *
   * On your own turn there is nobody in the strip to follow, so it anchors on
   * the player about to follow you — rotated to the left-hand end, and exactly
   * who you're weighing up while you decide. On the *first seat still holding
   * cards*, not simply the first seat: the rotation is by seat and not by who
   * is still alive (`lib/seating.ts`), so an out player can sit at that end,
   * and going hard left then spent the strip on somebody with no hand to read
   * and pushed the one you were actually deciding against off the far edge
   * (#132). They keep their place — they are still at the table — the strip
   * just stops anchoring on them.
   *
   * That seat is only brought into view, never centred: it is already at the
   * left-hand end, and centring it would scroll the table further than the
   * question needs. When nobody is out this lands on `0` exactly as before.
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
   * geometry is a dependency too: whoever the table is waiting on has to end up
   * centred against the widths as they finally settle, not the ones they had
   * before the last resize.
   *
   * Everything that decides a width goes in the key, not just the fan. A strip
   * that narrows while the sliver was already at the floor changes nothing about
   * the cards and everything about where the middle is, and watching the fan
   * alone left that resize centred on the width before it.
   */
  const waitingOn = game.waitingOn;
  const you = game.you;
  const nextUp = nextStillIn(others)?.id ?? null;
  const settled = `${available}:${fan.sliver}:${held.join(",")}`;
  useEffect(() => {
    const list = strip.current;
    if (!list || waitingOn === null) return;

    const yours = waitingOn === you;
    const anchor = yours ? nextUp : waitingOn;

    const end = Math.max(0, list.scrollWidth - list.clientWidth);
    let left = 0;

    if (anchor !== null) {
      const seat = list.querySelector<HTMLElement>(`[data-seat="${anchor}"]`);
      if (!seat) return;
      const centred = seat.offsetLeft - (list.clientWidth - seat.offsetWidth) / 2;
      const showingItsStart = seat.offsetLeft;
      const showingItsEnd = seat.offsetLeft + seat.offsetWidth - list.clientWidth;
      const wanted = yours
        ? Math.min(Math.max(showingItsEnd, 0), showingItsStart)
        : Math.min(Math.max(centred, showingItsEnd), showingItsStart);
      left = Math.min(Math.max(wanted, 0), end);
    }

    if (Math.abs(left - list.scrollLeft) < 1) return;
    // A hidden tab runs no animation frames, and a smooth scroll asked for
    // there is dropped rather than deferred — you'd come back to a table still
    // showing the wrong seat. Nobody is watching it glide, so don't ask it to.
    const gliding = !reduced && document.visibilityState === "visible";
    list.scrollTo({ left, behavior: gliding ? "smooth" : "auto" });
  }, [waitingOn, you, nextUp, reduced, settled]);

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
          shouting={shouting.get(player.id)}
          rows={fan.rows[seat] ?? 1}
        />
      ))}
    </ul>
  );
}
