import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from "react";

import type { GameView, PlayerView, RoomView, ShoutKind } from "@goleta/engine";

import { SEAT_OUT_MIN, fanTable, inRows, type SeatHand } from "../lib/fan.ts";
import { inTurnOrder, nextStillIn } from "../lib/seating.ts";
import { cardAnchor, seatAnchor } from "../lib/anchors.ts";
import { useMotion } from "../lib/motion.ts";
import type { Shout } from "../lib/feed.ts";
import { PlayingCard } from "./Card.tsx";
import { cardWidthPx } from "../lib/cardShape.ts";
import { usePrintScale } from "../lib/largePrint.ts";
import { AutopilotMark } from "./Autopilot.tsx";
import { HelpShout, HintedMark, shoutingNow } from "./Help.tsx";

const nameFor = (room: RoomView, id: string): string =>
  room.seats.find((seat) => seat.id === id)?.name ?? "Player";

/**
 * A seat that has run out of cards, collapsed to its name (#192). It used to keep
 * a full 128px seat, so at a table of eight the hands that still mattered were
 * competing for width with three holding nothing. Still on screen and still
 * named; what goes is the width. No sun and no shout: neither can happen to
 * somebody with no hand.
 *
 * **Laid out like a live seat rather than centred in one** (#334). It was
 * `items-center` in a row whose items stretch to the tallest of them, so the name
 * floated in the middle of a chip as tall as everybody else's cards. The name is
 * where a live seat's name is — top left, same font, grey — and the word *out*
 * sits where the cards would be. It was `sr-only` before; visible now, and the
 * duplicate is gone.
 *
 * **Every out seat is the same width**, handed in rather than found per seat: the
 * chips came out different sizes from each other, which reads as three different
 * kinds of thing rather than three people who are out.
 *
 * **The word sits in the middle of what the name leaves, not in the corner of
 * it** (#351). #334 put it "where the cards would be", which meant `mt-1.5` —
 * the live seat's gap between its name row and its hand, so the two lined up
 * down the strip. In an 80×98 chip that left the word at the top left with 48px,
 * half the chip, empty underneath it, which reads as something that failed to
 * render rather than as a seat with nothing in it. Lining up with the top of the
 * neighbours' cards is what that costs, and it is worth it.
 */
function OutSeat({
  playerId,
  name,
  width,
  seatRef,
}: {
  playerId: string;
  name: string;
  width: number;
  seatRef: RefCallback<HTMLElement>;
}) {
  return (
    <li
      ref={seatRef}
      data-seat={playerId}
      title={`${name} is out`}
      // `min-w-20` is the number `SEAT_OUT_MIN` in `fan.ts` floors the shared
      // width at, and the belt to this brace before anything has been measured.
      style={{ width }}
      className={[
        "flex min-w-20 shrink-0 flex-col rounded-xl bg-black/20 px-3 py-2",
        "opacity-45 ring-1 ring-white/10",
      ].join(" ")}
    >
      <span className="whitespace-nowrap text-sm font-semibold text-white/70">{name}</span>
      {/* Where the cards used to be — centred in it rather than parked at the top
          of it, on both axes. `flex-1` is what claims the room the name leaves;
          the chip itself is stretched to the tallest seat in the strip. */}
      <span className="flex flex-1 items-center justify-center text-xs text-white/50">out</span>
    </li>
  );
}

/** **No sun.** There used to be one wedged between the name and the count — 20px,
 * in a strip that scrolls sideways, for the most time-critical control in the
 * app. There is only ever one target, so the control names them (#189). */
function Seat({
  player,
  room,
  game,
  shouting,
  rows,
  outWidth,
}: {
  player: PlayerView;
  room: RoomView;
  game: GameView;
  shouting: ShoutKind | undefined;
  /** How many rows this hand takes at the strip's shared sliver. */
  rows: number;
  /** The one width every out seat is drawn at (#334). */
  outWidth: number;
}) {
  const { anchor, isArriving } = useMotion();
  const onClock = game.waitingOn === player.id;
  const out = player.eliminated;
  const seat = room.seats.find((candidate) => candidate.id === player.id);
  const hinted = seat?.hinted ?? false;
  const autopilot = seat?.autopilot ?? "off";

  // The anchor is how the motion layer finds this seat, and `data-seat` is how the
  // strip scrolls to it — neither wants a hole in it.
  const seatRef = anchor(seatAnchor(player.id));

  if (out) {
    return (
      <OutSeat
        playerId={player.id}
        name={nameFor(room, player.id)}
        width={outWidth}
        seatRef={seatRef}
      />
    );
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
      {}
      {shouting ? <HelpShout name={nameFor(room, player.id)} kind={shouting} /> : null}

      <div className="flex items-baseline gap-2">
        {/* No `truncate`: ten characters is under 90px at this size and the seat
            grows to hold it. The strip already scrolls, which #59 settled as the
            cost of fitting a table on a phone (#161). */}
        <span className="text-sm font-semibold text-white">{nameFor(room, player.id)}</span>
        {/* The standing half of the #33 bargain: taking help is never quiet. Not a
            tell — it says nothing about their hand, only their screen. */}
        {hinted ? <HintedMark name={nameFor(room, player.id)} className="self-center text-xs" /> : null}
        {/* Standing, for as long as it lasts. At a real table you can see somebody
            has gone (#202), and it is the explanation for a seat suddenly
            playing differently. */}
        <AutopilotMark
          mode={autopilot}
          left={seat?.left ?? false}
          name={nameFor(room, player.id)}
          className="self-center text-[0.65rem]"
        />
        <span
          className={[
            "ml-auto font-mono text-sm tabular-nums",
            player.cardCount <= 2 ? "text-rose-300" : "text-white/60",
          ].join(" ")}
        >
          {player.cardCount}
        </span>
      </div>

      {/* Deliberately no highlight on what they could play — working that out is
          the other half of the Sunny Rule. */}
      <div className="mt-1.5 flex flex-col gap-1">
        {inRows(player.hand, rows).map((row) => (
          // Cards slide left onto their neighbours by `--fan`, set once for the whole
          // table. Later cards paint over earlier ones by DOM order. The elements
          // keep their full box, shifted rather than shrunk: `resolveAnchor` reads
          // these rects to place a flight.
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

  /** The overlap is a table-wide decision, so it needs the strip's width and every
   * hand's size at once. Rounded down, so a fractional resize doesn't re-render
   * the table. */
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
   * Every out seat is drawn at one width, as small as the longest already-out
   * name allows (#334) — measured once across them rather than found per seat,
   * because chips at different widths read as different kinds of thing rather
   * than as three people who are out.
   *
   * Measured off a copy rather than off the chips themselves. A chip already
   * carrying the shared width measures back the width it was given, so the number
   * could never come down again once the longest name's owner had gone. The probe
   * is absolutely positioned and invisible, so it takes no part in the strip's
   * layout, and it carries the chip's own `px-3` and type — what comes back is a
   * chip width rather than a text width plus a constant somebody has to keep in
   * step.
   */
  const scale = usePrintScale();

  const outNames = others
    .filter((player) => player.eliminated)
    .map((player) => nameFor(room, player.id));
  const probe = useRef<HTMLLIElement>(null);
  const [outWidth, setOutWidth] = useState(SEAT_OUT_MIN);
  const measuring = outNames.join("\u0000");
  useLayoutEffect(() => {
    const node = probe.current;
    let widest = 0;
    for (const child of node?.children ?? []) {
      widest = Math.max(widest, child.getBoundingClientRect().width);
    }
    setOutWidth(Math.max(SEAT_OUT_MIN, Math.ceil(widest)));
  }, [measuring]);

  /** An eliminated seat is `"out"` rather than a hand of zero: `seatWidth(0, …)`
   * is a full 128px, and reserving that for a name chip would tighten everybody
   * else's cards to pay for it. The strip's arithmetic is told what a chip really
   * measures, or it is wrong about how much room is left for the hands that still
   * matter — which is the whole reason an out seat collapses at all. */
  const held: SeatHand[] = others.map((player) =>
    player.eliminated ? "out" : player.hand.length,
  );
  // Large print moves the rem behind every constant in `fan.ts`, so the strip's
  // arithmetic is told the same number the root font size moved by (#323). More
  // rows and more scrolling between seats is the expected outcome, not a
  // regression: rows are the release valve (#59).
  const fan = fanTable(available, held, outWidth, scale);

  /**
   * One rule for where the strip sits: show whoever the table is waiting on,
   * whole. `waitingOn` rather than the turn, so it also follows somebody who owes
   * a punishment card. On your own turn it anchors on the first seat *still
   * holding cards* — going hard left spent the strip on somebody with no hand to
   * read (#132) — and every other seat is centred but clamped, since centring
   * alone put a seat wider than the strip on its own middle.
   *
   * Arithmetic on the strip rather than `scrollIntoView`, and offsets rather
   * than bounding boxes, so a card mid-flight can't poison the measurement —
   * which is why the strip is `relative`.
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
    // A hidden tab runs no animation frames and drops a smooth scroll rather than
    // deferring it, so you'd come back to a table showing the wrong seat.
    const gliding = !reduced && document.visibilityState === "visible";
    list.scrollTo({ left, behavior: gliding ? "smooth" : "auto" });
  }, [waitingOn, you, nextUp, reduced, settled]);

  return (
    <ul
      ref={strip}
      // One overlap for the entire strip, so somebody holding three isn't squashed
      // differently from somebody holding twenty.
      style={{ "--fan": `${fan.sliver - cardWidthPx("sm", scale)}px` } as CSSProperties}
      // The padding is for the turn ring, which is drawn outside the border box, and
      // a box that clips one axis clips both.
      className="relative flex gap-2 overflow-x-auto p-1"
      aria-label="Other players"
    >
      {/* The probe the shared out-seat width is measured off. Out of the flow and
          out of the accessibility tree; the chips it is measuring are the real
          thing. */}
      <li
        ref={probe}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex"
      >
        {outNames.map((name, index) => (
          <span key={`${name}#${index}`} className="whitespace-nowrap px-3 text-sm font-semibold">
            {name}
          </span>
        ))}
      </li>
      {others.map((player, seat) => (
        <Seat
          key={player.id}
          player={player}
          room={room}
          game={game}
          shouting={shouting.get(player.id)}
          rows={fan.rows[seat] ?? 1}
          outWidth={outWidth}
        />
      ))}
    </ul>
  );
}
