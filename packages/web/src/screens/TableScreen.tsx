import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  isGameEvent,
  type ClientMessage,
  type GameView,
  type PlayerId,
  type RoomView,
  type ShoutKind,
} from "@goleta/engine";

import { AutopilotMark } from "../components/Autopilot.tsx";
import { HelpAsk, HintedMark, shoutingNow } from "../components/Help.tsx";
import { Piles } from "../components/Piles.tsx";
import { QrCode, QrGlyph } from "../components/QrCode.tsx";
import { RoomInvite } from "../components/RoomInvite.tsx";
import { CardBack, PlayingCard } from "../components/Card.tsx";
import { SUIT_GLYPH } from "../lib/cardShape.ts";
import { Seats } from "../components/Seats.tsx";
import { TableInstall } from "../components/TableInstall.tsx";
import { TableRotateNudge } from "../components/TableRotateNudge.tsx";
import { Button } from "../components/ui.tsx";
import { DECK } from "../lib/anchors.ts";
import { facingTurn } from "../lib/facing.ts";
import { namerFor, turnPrompt } from "../lib/format.ts";
import {
  fitScale,
  shouldTurn,
  turned,
  TABLE_DESIGN,
  type Box,
  type Point,
} from "../lib/fitScale.ts";
import { ANNOUNCE_MS } from "../lib/beats.ts";
import { useJudgedCall } from "../lib/judgedCall.ts";
import { useDeparture } from "../lib/departure.ts";
import { useSeatFling, type SeatFling } from "../lib/seatFling.ts";
import { useReshuffle } from "../lib/reshuffle.ts";
import { deckPoint, pileBox, pilePoint } from "../lib/pileBox.ts";
import { BAND, edgeSeats, seatPoint, TURN_FOR } from "../lib/tableEdges.ts";
import { tablePoint, type TablePlaces } from "../lib/tableFlight.ts";
import { useWakeLock } from "../lib/wakeLock.ts";
import { planFlights, TABLE_SCREEN, type FlightPlan } from "../motion/plan.ts";
import { usePrefersReducedMotion } from "../motion/reducedMotion.ts";
import { joinLink } from "../net/route.ts";
import type { LoggedEvent, Shout } from "../lib/feed.ts";

/**
 * The middle of the table, on an optional extra device propped where everyone
 * can see it. **Nothing anywhere depends on this existing** — the phone view
 * carries its own peek strip.
 *
 * It joins as a watcher (#16) with a `table` bit, which buys two narrow
 * auxiliary actions: tapping the draw pile in an IRL room draws for the current
 * player, and between games a name can be dragged to the edge its player is
 * sitting at (#201). It cannot play, name a suit, call Sunny or end a turn.
 *
 * **It is still drawn without `TableMotion`**, whose flight layer portals to the
 * body where this screen's transform cannot reach it. `TableFlights` below is
 * this board's own, inside the transform and aimed in design coordinates — it
 * shares `motion/plan.ts` and replaces only the anchor resolution (#200).
 *
 * **Every piece is placed against the design box rather than stacked in a
 * column** (#141), inside bands reserved for the seat names on all four sides.
 */
export function TableScreen({
  room,
  game,
  log,
  shouts,
  offline,
  send,
}: {
  room: RoomView;
  game: GameView | null;
  log: LoggedEvent[];
  /** A name and a word — no cards, and nothing about whose turn it is going well. */
  shouts: Shout[];
  offline: boolean;
  send: (message: ClientMessage) => void;
}) {
  const nameOf = namerFor(room);
  const { call, peeling, announcing, endAnnouncement } = useJudgedCall(log);

  /**
   * The ruling's own clock. This rendered on `call && !peeling`, and `call` is
   * just the last `sunnyCalled` in the log, so the ruling stood until the next
   * one — at a quiet table, the rest of the game (#185). Nobody dismisses
   * anything on a propped-up screen, so here it is the timer alone.
   */
  useEffect(() => {
    if (!announcing) return;
    const timer = setTimeout(endAnnouncement, ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [announcing, endAnnouncement]);
  const [view, setView] = useState<"center" | "hands">("center");
  /** Off the glyph in the corner (#162). This was the one surface where the code
   * was not tappable, so adding a player mid-hand meant finding somebody's phone. */
  const [inviting, setInviting] = useState(false);

  /** Nobody touches this screen, so nothing else will keep it awake (#81). */
  useWakeLock(true);

  /** The box is kept rather than the scale, because two things are read off it:
   * how much to scale by, and whether the board fits better turned (#141). */
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;

    /**
     * **Measured here, not only when the observer says so** (#285). A
     * `ResizeObserver`'s first delivery is not something to rely on: in Chrome it
     * simply never arrived on about two loads in three, leaving the box at zero —
     * and `fitScale` answers 1 for a box with no size, so the board drew at its
     * full 1000px inside an 894px screen and the seat names pinned to the edges
     * were cut in half. That is the failure #141 is about, arriving by a
     * different route.
     */
    setBox(contentBox(element));
    const watch = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  const quarter = shouldTurn(box);
  const scale = fitScale(quarter ? turned(box) : box);

  /**
   * Dragging a name to the edge its player is sitting at (#201). The board is the
   * element carrying the transform, so a pointer can be put back into design
   * coordinates — the arithmetic is in `designPoint`, which is pure and tested.
   *
   * **An IRL room, between games.** The server checks both again, and refuses an
   * online room outright exactly as it refuses the shared-screen draw: those are
   * strangers, and none of them get to reorder a stranger's table.
   */
  const board = useRef<HTMLDivElement>(null);
  const fling = useSeatFling({
    board,
    scale,
    quarter,
    seats: room.seats,
    send,
    enabled: room.irl && room.status !== "playing",
  });

  // The inset goes on the frame, so `fitScale` fits the design into the *safe* box
  // without learning that hardware exists. It matters most here: the seat names
  // sit on the very edges of the design box, so a propped tablet would lose a
  // name rather than a margin.
  return (
    <div
      ref={frame}
      className={[
        "relative flex h-dvh w-full items-center justify-center overflow-hidden",
        "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        "pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
      ].join(" ")}
    >
      <div
        style={
          {
            width: TABLE_DESIGN.width,
            height: TABLE_DESIGN.height,
            // Read right to left: sized first, then turned.
            transform: `${quarter ? "rotate(90deg) " : ""}scale(${scale})`,
            // Nothing inside an element can see a transform on an ancestor, so the place
            // that knows publishes it and `bee-back` divides its thread back down
            // (#169). The quarter turn is not in it — turning changes nothing
            // about how large a pixel is.
            "--paint-scale": scale,
          } as CSSProperties
        }
        className="relative shrink-0"
        ref={board}
      >
        {game ? (
          <Playing
            room={room}
            fling={fling}
            boardScale={scale}
            game={game}
            nameOf={nameOf}
            call={call}
            peeling={peeling}
            announcing={announcing}
            shouts={shouts}
            log={log}
            view={view}
            onToggleView={() => setView(view === "center" ? "hands" : "center")}
            onShowInvite={() => setInviting(true)}
            onDraw={() =>
              send({
                t: "intent",
                intent: { type: "drawCard", playerId: game.waitingOn ?? "" },
              })
            }
          />
        ) : (
          <Waiting room={room} fling={fling} />
        )}

        {/* A screen that has lost touch with its table should say so rather than
            show a still life. */}
        {offline ? (
          <p
            className="absolute left-1/2 top-1.5 -translate-x-1/2 text-xl text-amber-300"
            role="status"
          >
            reconnecting…
          </p>
        ) : null}
      </div>

      {/* Outside the design box on purpose: both are about the device rather than
          the board, and the invite is a panel somebody holds a camera up to. */}
      <TableRotateNudge />

      {inviting ? (
        <RoomInvite
          code={room.code}
          underWay={game !== null && game.status !== "over"}
          screens={room.tableScreens}
          onClose={() => setInviting(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * The frame's **content** box, which is what `ResizeObserver` reports and
 * therefore what the first measurement has to agree with (#285).
 *
 * Not `getBoundingClientRect()`: the frame carries the `env(safe-area-inset-*)`
 * padding on purpose, so `fitScale` fits the design into the *safe* box rather
 * than the whole screen. Measuring the border box would put a name back under
 * the hardware on the one screen whose names sit on the very edges.
 */
const contentBox = (element: HTMLElement): Box => {
  const style = getComputedStyle(element);
  const across = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const down = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  return {
    width: Math.max(0, element.clientWidth - across),
    height: Math.max(0, element.clientHeight - down),
  };
};

/** Stated rather than measured, because the design box is a fixed rectangle —
 * the whole point of `fitScale.ts` — so this is arithmetic a test can hold. */
/** A name fills 46 of its 48-pixel band, so piles fitted flush touch the names,
 * which across a room reads as the collision this was fixing. */
const GUTTER = 10;

const CENTRE_PILE_ROOM = {
  width: TABLE_DESIGN.width - BAND.side * 2 - GUTTER * 2,
  height: TABLE_DESIGN.height - BAND.top - BAND.bottom - GUTTER * 2,
};
const HANDS_PILE_ROOM = { width: TABLE_DESIGN.width - 40, height: 240 };

/** Derived rather than written down: the centre view's container is symmetric,
 * and the hands view keeps its slot directly under the top band. */
const CENTRE_PILES_AT = {
  x: TABLE_DESIGN.width / 2,
  y: (BAND.top + (TABLE_DESIGN.height - BAND.bottom)) / 2,
};
const HANDS_PILES_AT = {
  x: TABLE_DESIGN.width / 2,
  y: BAND.top + HANDS_PILE_ROOM.height / 2,
};

/**
 * The piles at whatever size the room they were given will take. `scale-[2.5]`
 * was a paint transform and therefore invisible to the layout, so the ink grew
 * about its own middle into the band the seat names live in (#159). The scale is
 * **asked for** now, and the wrapper reserves what will actually be painted.
 */
function ScaledPiles({ room, outer, children }: { room: Box; outer: number; children: ReactNode }) {
  const box = pileBox("xl");
  const scale = fitScale(room, box);
  return (
    <div
      style={{ width: box.width * scale, height: box.height * scale }}
      className="flex shrink-0 items-center justify-center"
    >
      <div
        style={
          {
            transform: `scale(${scale})`,
            // Multiplied by hand: a custom property referring to itself would be a cycle
            // and resolve to nothing (#169).
            "--paint-scale": outer * scale,
          } as CSSProperties
        }
        className="shrink-0"
      >
        {children}
      </div>
    </div>
  );
}

/** Both views drawn as the thing each one shows (#168). Sized in `em` and
 * stroked in `currentColor`, so the pair take the button's own size and hover. */
function CentreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-[1em] w-[1em]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="2.2" y="4.2" width="8.6" height="15.6" rx="2" />
      <rect x="13.2" y="4.2" width="8.6" height="15.6" rx="2" />
    </svg>
  );
}

function HandsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-[1em] w-[1em]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    >
      {/* Filled and faded first, which came out as one grey smudge at this size.
        Outlines keep each card a card. */}
      <rect
        x="4.8"
        y="6"
        width="7"
        height="12.5"
        rx="1.5"
        transform="rotate(-15 12 18.5)"
        className="fill-felt-950"
      />
      <rect
        x="12.2"
        y="6"
        width="7"
        height="12.5"
        rx="1.5"
        transform="rotate(15 12 18.5)"
        className="fill-felt-950"
      />
      <rect x="8.5" y="4.5" width="7" height="12.5" rx="1.5" className="fill-felt-950" />
    </svg>
  );
}

/** Between games, and before the first one: the way in, at the size of a room. */
function Waiting({ room, fling }: { room: RoomView; fling: SeatFling | null }) {
  const link = joinLink(room.code);

  return (
    <>
      <EdgeNames room={room} drag={fling} />

      {/* Stacked, a code worth crossing a room for plus the room code under it came
          to more than the board is tall. */}
      <div
        style={{ top: BAND.top, bottom: BAND.bottom, left: BAND.side, right: BAND.side }}
        className="absolute flex items-center justify-center gap-10"
      >
        <QrCode
          value={link}
          label={`Scan to join room ${room.code}`}
          className="w-80 shrink-0 p-5"
        />
        <div className="min-w-0">
          {/* Whoever scanned is across the table watching this light up, and this
              confirms it landed on the right one of the two codes (#138). */}
          <p className="text-xl uppercase tracking-[0.3em] text-white/35">Shared screen</p>
          <p className="mt-2 font-mono text-7xl font-semibold tracking-[0.18em] text-amber-300">
            {room.code}
          </p>
          <p className="mt-3 text-3xl text-white/50">{location.host}</p>
          {room.seats.length < room.minPlayers ? (
            <p className="mt-5 text-2xl text-amber-300">Needs {room.minPlayers} to deal.</p>
          ) : null}
        </div>
      </div>

      {/* Waiting state only, never over a game. */}
      <TableInstall />
    </>
  );
}

/** A game in progress: the two piles, whose turn it is, and what everyone holds. */
function Playing({
  room,
  fling,
  boardScale,
  game,
  nameOf,
  call,
  peeling,
  announcing,
  shouts,
  log,
  view,
  onToggleView,
  onShowInvite,
  onDraw,
}: {
  room: RoomView;
  /** Null unless the table may be reordered from here — an IRL room, between
   * games (#201). */
  fling: SeatFling | null;
  /** What the board is scaled by, for anything that has to divide it out. */
  boardScale: number;
  game: GameView;
  nameOf: (playerId: string) => string;
  call: ReturnType<typeof useJudgedCall>["call"];
  peeling: boolean;
  /** The evidence has gone and the ruling is up. */
  announcing: boolean;
  shouts: Shout[];
  log: LoggedEvent[];
  view: "center" | "hands";
  onToggleView: () => void;
  onShowInvite: () => void;
  onDraw: () => void;
}) {
  const finished = game.status === "over";
  const asking = shoutingNow(shouts);
  // The same conditions the server checks, the bot one included: a bot's turn
  // passes under a finger already on its way down, and nothing off this screen
  // moves a bot.
  const seatOnClock = room.seats.find((seat) => seat.id === game.waitingOn);
  const canDraw =
    room.irl &&
    game.phase.kind === "action" &&
    !finished &&
    seatOnClock !== undefined &&
    !seatOnClock.bot;

  /** Off the same hook the phones read, so it is the same five seconds (#209). */
  const { drawPileSize: reshuffling } = useReshuffle(log);
  const departed = useDeparture(log);

  /** Which way up the board says things (#160). Two positions rather than four —
   * see `facing.ts` for why the prompt cannot be stood on its end. */
  const turn = facingTurn(room, game);

  // A card in the air has to leave the deck that is actually on screen.
  const pileRoom = view === "hands" ? HANDS_PILE_ROOM : CENTRE_PILE_ROOM;
  const pilesAt = view === "hands" ? HANDS_PILES_AT : CENTRE_PILES_AT;

  const piles = (
    <Piles
      game={game}
      canDraw={canDraw}
      onDraw={onDraw}
      irl={room.irl}
      size="xl"
      turn={turn}
      peel={
        peeling && call
          ? {
              evidence: call.evidence,
              named: call.card,
              callerName: nameOf(call.callerId),
              targetName: nameOf(call.targetId),
            }
          : null
      }
    />
  );

  return (
    <>
      {/* The hand strip names everybody itself. */}
      {view === "center" ? (
        <EdgeNames room={room} game={game} asking={asking} drag={fling} />
      ) : null}
      <TableFlights
        room={room}
        game={game}
        log={log}
        places={{
          seats: room.seats,
          // The deck and the pile move with the view, and a card has to leave the
          // one that is actually on screen (#164).
          deck: deckPoint(pileRoom, pilesAt, "xl"),
          pile: pilePoint(pileRoom, pilesAt, "xl"),
          design: TABLE_DESIGN,
        }}
        scale={fitScale(pileRoom, pileBox("xl"))}
        paint={boardScale}
      />

      {/* No name reaches the top corners, and the board is composed around the
          piles, so anything above them is the first thing the peel lands on. */}

      {/* Four grey characters in a `<p>` until #162, and the only surface in the
          app where the code was not tappable. */}
      <button
        type="button"
        aria-label={`Invite to room ${room.code}`}
        aria-haspopup="dialog"
        onClick={onShowInvite}
        className={[
          "absolute left-2 top-1 rounded-lg p-1.5 text-3xl text-white/30",
          "transition-colors hover:text-white/70",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        ].join(" ")}
      >
        <QrGlyph />
      </button>

      {/* Two icons rather than two words (#168): a word in a corner reads as a
          heading for the view you are in about as readily as a way out of it. */}
      <Button
        variant="ghost"
        className="absolute right-2 top-1 p-2 text-3xl"
        style={{ transform: `rotate(${turn}deg)` }}
        onClick={onToggleView}
        aria-label={view === "center" ? "Show every hand" : "Show the middle of the table"}
      >
        {view === "center" ? <HandsIcon /> : <CentreIcon />}
      </Button>

      {view === "hands" ? (
        <div
          style={{ top: BAND.top, bottom: BAND.bottom, left: 20, right: 20 }}
          className="absolute flex flex-col items-center gap-4"
        >
          <div className="flex h-60 shrink-0 items-center justify-center">
            <ScaledPiles room={pileRoom} outer={boardScale}>
              {piles}
            </ScaledPiles>
          </div>
          {/* The strip flips, and only the strip (#163). 180° swaps top for bottom, so
            a turned panel puts the piles under the prompt pinned to the bottom
            band — and the piles inside would be turned twice, which is no turn
            at all. */}
          <div className="min-h-0 w-full flex-1">
            {/* On a box the size of the strip, not the box that *holds* it: `flex-1`
              fills the height that is left, so turning that swings the strip to
              the bottom. */}
            <div style={{ transform: `rotate(${turn}deg)` }}>
              <Seats room={room} game={game} shouts={shouts} />
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{ top: BAND.top, bottom: BAND.bottom, left: BAND.side, right: BAND.side }}
          className="absolute flex items-center justify-center"
        >
          <ScaledPiles room={pileRoom} outer={boardScale}>
            {piles}
          </ScaledPiles>
        </div>
      )}

      {/* A floating pill, so it costs the board no height, and it reads from
          whichever end of the table is playing (#160). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 z-40 mx-auto flex max-w-128 justify-center">
        <p
          style={{ transform: `rotate(${turn}deg)` }}
          className="rounded-2xl bg-felt-950/80 px-6 py-3 text-balance text-center text-2xl font-semibold leading-tight shadow-2xl backdrop-blur-sm"
          role="status"
        >
          {announcing && call ? (
            // It holds the band for the announce beat and then gives it back. A game can
            // end on the play a landed call forced, so this comes before `finished`.
            <span className="text-amber-300">
              <span aria-hidden>☀️</span> {nameOf(call.callerId)} called it on{" "}
              {nameOf(call.targetId)} — said the {call.card.rank}
              {SUIT_GLYPH[call.card.suit]}.{" "}
              <span className="text-white/70">{call.correct ? "Right." : "Wrong."}</span>
            </span>
          ) : reshuffling !== null || departed !== null ? (
            // This screen has no log, so without it a reshuffle was a number changing
            // (#209) and a departure was nothing at all (#256). After the ruling,
            // for the reason the peel comes first.
            <span className="text-amber-300">
              {turnPrompt(game, nameOf, false, false, reshuffling, departed)}
            </span>
          ) : finished ? (
            <span className="text-amber-300">{turnPrompt(game, nameOf, false)}</span>
          ) : (
            <span className="text-white/60">
              <span aria-hidden className="text-amber-300">
                ▸{" "}
              </span>
              {turnPrompt(game, nameOf, false)}
            </span>
          )}
        </p>
      </div>
    </>
  );
}

/**
 * The names round the edge, each turned to be read from that seat and each
 * carrying its own count — two lists of the same players was most of what used
 * to overflow. Placed by their own centre point, so the turn happens about the
 * middle of the label rather than swinging it into the board.
 *
 * **A name can be dragged to the edge its player is actually sitting at** (#201),
 * which reorders the table — position on this board *is* seat order, and seat
 * order is turn order, so there is no separate "where the name is drawn" to
 * change. It is the shared-screen twin of the lobby's arrows and sends the same
 * `moveSeat` hops underneath, for the reason `docs/PROTOCOL.md` gives: a whole
 * posted order can arrive stale, a swap cannot.
 *
 * `drag` is null wherever it isn't offered, which the caller decides: **an IRL
 * room, between games**, both of which the server checks again. The threshold is
 * deliberate — this screen is propped in the middle of a table where somebody
 * will put a drink down on it.
 *
 * The label keeps **its own angle while in flight**, and settles into the new
 * edge's on the drop. Turning it mid-drag would mean re-aiming the thing under
 * somebody's finger at every frame, and a name being read at a slant on the way
 * across is not the confusion — where it lands is.
 */
function EdgeNames({
  room,
  game = null,
  asking = new Map<PlayerId, ShoutKind>(),
  drag = null,
}: {
  room: RoomView;
  game?: GameView | null;
  asking?: ReadonlyMap<PlayerId, ShoutKind>;
  drag?: SeatFling | null;
}) {
  const placed = edgeSeats(room.seats.length);

  return (
    <div
      aria-hidden
      className={["absolute inset-0", drag ? "" : "pointer-events-none"].join(" ")}
    >
      {room.seats.map((seat, index) => {
        const spot = placed[index];
        if (!spot) return null;
        const player = game?.players.find((candidate) => candidate.id === seat.id);
        const onClock = game?.waitingOn === seat.id;
        // The same point a card drawn by this seat is thrown at (#164): two things
        // aiming at a seat should not each have their own idea of where it is.
        const at = seatPoint(spot, TABLE_DESIGN);
        const anchor: CSSProperties = { left: at.x, top: at.y };
        const flung = drag?.holding === seat.id ? drag.offset : null;

        return (
          /* The anchor has no size of its own, which is load-bearing: sized by its
            label, a `right`/`bottom` anchor pins the far edge of the *label*
            rather than the point. */
          <div key={seat.id} style={anchor} className="absolute h-0 w-0">
            {/* Every seat is a pill and the seat on the clock is a brighter one; only
              the active seat used to have a shape at all, so the highlight was a
              background appearing rather than a change of emphasis (#165). Name,
              count and ask were three type sizes on one baseline — coming down
              to `text-2xl` is also what lets a ten-character name fit whole. */}
            <div
              onPointerDown={drag ? (event) => drag.onGrab(event, seat.id) : undefined}
              onPointerMove={drag?.onDrag}
              onPointerUp={drag?.onDrop}
              onPointerCancel={drag?.onDrop}
              style={{
                // The drag rides *outside* the turn, so the name follows the
                // pointer across the board rather than along its own axis.
                transform: flung
                  ? `translate(${flung.x}px, ${flung.y}px) translate(-50%, -50%) rotate(${TURN_FOR[spot.edge]}deg)`
                  : `translate(-50%, -50%) rotate(${TURN_FOR[spot.edge]}deg)`,
              }}
              className={[
                "absolute left-0 top-0 flex w-max max-w-54 items-center gap-2",
                "whitespace-nowrap rounded-full px-3 py-1 ring-1",
                "text-2xl font-semibold transition-colors",
                onClock
                  ? "bg-amber-300/15 text-amber-300 ring-amber-300/40"
                  : "bg-felt-950/40 text-white/60 ring-white/10",
                player?.eliminated ? "opacity-45" : "",
                // `touch-none` is load-bearing on a touch screen: without it a drag
                // across the board is the browser's own pan gesture.
                drag ? "cursor-grab touch-none select-none" : "",
                flung ? "z-10 cursor-grabbing ring-amber-300/60" : "",
              ].join(" ")}
            >
              <span className="min-w-0 truncate">{seat.name}</span>
              {player ? (
                player.eliminated ? (
                  /* Being out is a state rather than a very small hand. */
                  <span className="shrink-0 text-sm uppercase tracking-widest">out</span>
                ) : (
                  <span
                    className={[
                      "shrink-0 font-mono text-xl tabular-nums",
                      /* Marked whether or not it is their turn: it used to carry `!onClock`,
                         so the seat about to play the turn that could finish
                         them was drawn as ordinary text (#170). */
                      player.cardCount <= 2 ? "text-rose-300" : "opacity-60",
                    ].join(" ")}
                  >
                    {player.cardCount}
                  </span>
                )
              ) : null}
              {/* Both, because they answer different questions: one lasts, the other
                  is *they just said something*. */}
              {seat.hinted ? <HintedMark name={seat.name} className="text-lg" /> : null}
              <AutopilotMark
                mode={seat.autopilot}
                left={seat.left}
                name={seat.name}
                className="text-sm"
              />
              {asking.get(seat.id) ? (
                <HelpAsk kind={asking.get(seat.id)} className="shrink-0 text-lg" />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Anything older than this already happened somewhere else — the same rule the
 * phone's flight layer keeps, so a screen joining mid-game does not replay the
 * hand at whoever just walked up to it. */
const STALE_MS = 1500;

/** How long a card coming off the deck spends turning over before it travels.
 * In step with `--flip` in `index.css`. */
const FLIP_MS = 240;

/**
 * Added to every planned duration. The plan's figures are tuned for a phone,
 * where the longest trip is a hand's width; here the same flight crosses a board
 * somebody is reading from across a room, and at 220ms that is a flicker rather
 * than a card going somewhere. It is added rather than replacing them so the
 * *relationships* the plan sets — a recycle card slower and flatter than a draw
 * — survive.
 */
const TABLE_TRIP_MS = 260;

/** Long enough after the last flight has finished for its fade to be over. */
const SWEEP_GRACE_MS = 200;

/** A plan with both ends resolved to points on the board. */
interface LiveFlight extends Omit<FlightPlan, "from" | "to"> {
  from: Point;
  to: Point;
  /** Off the deck with a face on it, so it turns over before it goes. */
  turns: boolean;
}

/**
 * Everything that changes place, seen changing place (#200).
 *
 * Almost nothing moved on this board before: cards appeared in hands, appeared
 * on the pile, and vanished off the deck. At a table of six with a tablet in the
 * middle that is hard to follow, which is the one job this screen has.
 *
 * **The planning is `motion/plan.ts`, shared with the phone rather than written
 * again.** It is pure and tested and already turns a batch of events into
 * ordered flights — the deal the engine emits no events for, the hold a peel is
 * entitled to, the recycle's nine face-down cards, the compression that stops a
 * burst narrating a queue it has already left behind. What this adds is the
 * anchor resolution: `tablePoint` puts an `AnchorKey` in **design coordinates**
 * instead of reading a DOM rect, so a flight lives inside the board's own
 * transform and survives the quarter turn and every scale without one of its
 * own (#141).
 *
 * **Nothing waits for it.** There is no `dealing` here and no gate on anything:
 * the prompt says what it says, the deck stays tappable, and a ruling lands when
 * the ruling lands. It is drawn last and `pointer-events-none`.
 *
 * **Reduced motion plans nothing**, and the board is correct with no flights at
 * all — every count, the pile and the prompt are read from the state.
 */
function TableFlights({
  room,
  game,
  log,
  places,
  scale,
  paint,
}: {
  room: RoomView;
  game: GameView;
  log: LoggedEvent[];
  places: TablePlaces;
  /** What the piles were fitted at, so a card in the air matches them. */
  scale: number;
  /** The board's own scale, for `--paint-scale`: a card back's thread is a screen
   * measurement and must not grow with the board (#169). */
  paint: number;
}) {
  const reduced = usePrefersReducedMotion();
  const seen = useRef(0);
  const sequence = useRef(0);
  /** One per batch, so a second batch arriving does not cancel the first one's
   * sweep and leave its cards in the DOM forever. */
  const sweeps = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [flights, setFlights] = useState<LiveFlight[]>([]);

  useEffect(() => {
    const timers = sweeps.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // `places` and `game` are deliberately not watched: they are read at the moment
  // a batch arrives, and re-planning a landed flight because the board resized
  // would fly every card again.
  useEffect(() => {
    const fresh = log.filter((entry) => entry.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = fresh[0]?.id ?? seen.current;
    if (reduced) return;

    // The table acts out what just happened, never what it is only now being
    // shown: a screen propped up mid-game does not replay the hand at whoever
    // just walked over to it.
    const now = Date.now();
    const recent = fresh.filter((entry) => now - entry.at < STALE_MS);
    if (recent.length === 0) return;

    // Game events only: the log also carries what happens to the table, and a
    // seat leaving puts no card in the air (#256).
    const { flights: plans } = planFlights(
      recent.toReversed().map((entry) => entry.event).filter(isGameEvent),
      game,
      () => `t${(sequence.current += 1)}`,
      TABLE_SCREEN,
    );

    const live: LiveFlight[] = [];
    for (const plan of plans) {
      const from = tablePoint(plan.from, places);
      const to = tablePoint(plan.to, places);
      // Nowhere to fly from or to — a seat that has left, most likely. The board
      // is correct without it, which is the same answer the phone gives when a
      // seat is off screen.
      if (!from || !to) continue;
      live.push({ ...plan, from, to, turns: plan.card !== null && plan.from[0] === DECK });
    }
    if (live.length === 0) return;

    setFlights((current) => [...current, ...live]);
    const last = Math.max(...live.map((flight) => flight.delay + flight.duration));
    const ids = new Set(live.map((flight) => flight.id));
    const sweep = setTimeout(() => {
      sweeps.current.delete(sweep);
      setFlights((current) => current.filter((flight) => !ids.has(flight.id)));
    }, last + FLIP_MS + TABLE_TRIP_MS + SWEEP_GRACE_MS);
    sweeps.current.add(sweep);
  }, [log, reduced]);

  return (
    <>
      {flights.map((flight) => (
        <div
          key={flight.id}
          style={
            {
              left: flight.from.x,
              top: flight.from.y,
              "--dx": `${flight.to.x - flight.from.x}px`,
              "--dy": `${flight.to.y - flight.from.y}px`,
              "--delay": `${flight.delay + (flight.turns ? FLIP_MS : 0)}ms`,
              "--duration": `${flight.duration + TABLE_TRIP_MS}ms`,
            } as CSSProperties
          }
          className="table-screen-card pointer-events-none absolute z-30"
        >
          <div
            style={
              {
                transform: `scale(${scale})`,
                // Multiplied by hand, for `ScaledPiles`' reason: a property that
                // referred to itself would be a cycle and resolve to nothing (#169).
                "--paint-scale": paint * scale,
              } as CSSProperties
            }
          >
            {flight.card === null ? (
              <CardBack size="xl" />
            ) : flight.turns ? (
              /* Off the deck, so it turns over before it goes. Two children in one
                 box, squashed against each other — the travel is on the parent
                 and starts once this has finished, so they never fight over
                 `transform`. */
              <span className="relative block">
                <span
                  style={{ "--delay": `${flight.delay}ms` } as CSSProperties}
                  className="table-screen-turn-back block"
                >
                  <CardBack size="xl" />
                </span>
                <span
                  style={{ "--delay": `${flight.delay}ms` } as CSSProperties}
                  className="table-screen-turn-face absolute inset-0 block"
                >
                  <PlayingCard card={flight.card} size="xl" mirrored={room.irl} />
                </span>
              </span>
            ) : (
              <PlayingCard card={flight.card} size="xl" mirrored={room.irl} />
            )}
          </div>
        </div>
      ))}
    </>
  );
}
