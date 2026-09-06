import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  isGameEvent,
  type Card,
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
import { SettingsCog } from "../components/Settings.tsx";
import { CardBack, PlayingCard } from "../components/Card.tsx";
import { SUIT_GLYPH } from "../lib/cardShape.ts";
import { Seats } from "../components/Seats.tsx";
import { TableInstall } from "../components/TableInstall.tsx";
import { TableRotateNudge } from "../components/TableRotateNudge.tsx";
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
import { ScrollRelease } from "../components/ScrollRelease.tsx";
import { useSeatFling, type SeatFling } from "../lib/seatFling.ts";
import { useReshuffle } from "../lib/reshuffle.ts";
import { deckPoint, pileBox, pilePoint } from "../lib/pileBox.ts";
import {
  edgeSeats,
  nameRung,
  seatPoint,
  spotsOf,
  TURN_FOR,
  type NameRung,
} from "../lib/tableEdges.ts";
import { MotionContext, NO_MOTION, type MotionApi } from "../lib/motion.ts";
import { faceOf, landed, setOff, SETTLED, type PileHold } from "../lib/pileHold.ts";
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
   * Room settings, from the middle of the table (#326).
   *
   * **IRL rooms only**, the same gate as this screen's other auxiliary actions
   * and for the same reason: in a room where that flag means what it says
   * everybody present can already reach the propped-up screen, and an online room
   * is strangers. The server checks it again.
   *
   * **Room settings only.** No `personal` half: that half is about cards this
   * device does not hold, and nobody may set autopilot or hints for anybody else
   * (#202, #187). `isHost` is true because this cog *is* the room's — there is no
   * personal page for it to be a door out of.
   *
   * It matters most on a room this screen opened itself, which has no host until
   * the first person joins and would otherwise have nothing able to set it up.
   *
   * **It is drawn inside the board now** (#438), in the row along the top with
   * the invite and the view toggle. It was pinned to the frame instead, in device
   * pixels, because its panel is `fixed` and the board's transform would have
   * scaled and turned it — so the three controls only lined up at scale 1, which
   * is a scale no device has. The panel portals to the body; see `Settings.tsx`.
   */
  const settings = room.irl ? (
    <SettingsCog
      isHost
      className={TOP_CONTROL}
      glyph="h-[1em] w-[1em]"
      rules={room.houseRules}
      irl={room.irl}
      dealerMode={room.dealerMode}
      shuffleSeats={room.shuffleSeats}
      onRules={(rules) => send({ t: "setHouseRules", rules })}
      onIrl={(on) => send({ t: "setIrl", on })}
      onDealerMode={(mode) => send({ t: "setDealerMode", mode })}
      onShuffleSeats={(on) => send({ t: "setShuffleSeats", on })}
    />
  ) : null;

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
    /**
     * **Changing the owner is deliberately hard to find** (#326): a long press
     * on a name, with no label, no hint, nothing on any other screen and nothing
     * costing the board any ink. It is an exotic fringe case — the host has gone
     * home with their phone and the table is still sitting here — and should be
     * minimally discoverable by design.
     *
     * It shares the gesture with the drag rather than being layered over it, so
     * the two cannot fight: travelling `THRESHOLD` cancels the press, and the
     * press letting go cancels the drop. Same gate as the drag on both sides of
     * the wire, and `enabled` above is that gate.
     */
    onLongPress: (playerId) => send({ t: "setHost", playerId }),
  });

  // The inset goes on the frame, so `fitScale` fits the design into the *safe* box
  // without learning that hardware exists. It matters most here: the seat names
  // sit on the very edges of the design box, so a propped tablet would lose a
  // name rather than a margin.
  return (
    <>
      {/* `sticky top-0`, and `ScrollRelease` at the foot of this fragment: this
          screen has no fullscreen control outside the waiting state's install
          pilot, so a drag that collapses the browser's chrome is the only way it
          gets that height back (#327). Pinning is what keeps the board still
          while that drag happens — and `contentBox` is a `ResizeObserver`, so
          `fitScale` re-runs on the new height rather than fighting it (#285).

          It replaces `relative` rather than joining it: both set `position`, and
          Tailwind emits `relative` last, so the two together are just `relative`
          and the pin silently does nothing. `sticky` establishes a containing
          block for the board and the panels above it exactly as `relative`
          did. */}
      <div
        ref={frame}
        className={[
          "sticky top-0 flex h-dvh w-full items-center justify-center overflow-hidden",
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
              settings={settings}
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
            <Waiting room={room} fling={fling} settings={settings} />
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
      <ScrollRelease />
    </>
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

/**
 * The one shape the three controls along the top of the board share (#438): the
 * cog, the invite and the toggle between the middle of the table and every hand.
 *
 * They used to be three sizes in two coordinate systems — a 44px box round a
 * 20px mark pinned to the *frame*, and two `text-3xl` glyphs with different
 * padding on the *board* — so they lined up only at scale 1 and drifted apart on
 * every real device. One box, one mark, one colour, and `SettingsCog` takes it
 * as its `className` rather than being asked to match by hand.
 */
const TOP_CONTROL = [
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-3xl",
  "text-white/60 transition-colors hover:bg-white/5 hover:text-white",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
].join(" ");

/**
 * And where they sit: one row across the top band, the corners
 * `nameRung.band.corner` reserves and no name is ever drawn in.
 *
 * **The row itself takes no taps.** It spans the width, and the middle of it is
 * over the top edge's names — which can be dragged to reorder the table (#201),
 * so a full-width box swallowing pointers there would quietly take that away.
 * The clusters take them back.
 */
const TOP_ROW = "pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between";
const TOP_CLUSTER = "pointer-events-auto flex items-center gap-1";

/** The room between the bands, which moves with them: the large rung's deeper
 * bands are what the centre piles give up for a name anybody can read (#320). */
const centrePileRoom = (band: NameRung["band"]) => ({
  width: TABLE_DESIGN.width - band.side * 2 - GUTTER * 2,
  height: TABLE_DESIGN.height - band.top - band.bottom - GUTTER * 2,
});
/**
 * The hands view's column, which is **its own** rather than the name bands'
 * (#439). This view draws no edge names — the strip names everybody itself — so
 * the only two things it has to keep clear of are the row of controls along the
 * top (#438) and the turn prompt at the foot (#442). It used to sit inside
 * `band.top`/`band.bottom`, which reserved room for names that are not there and
 * still ended 38 pixels below the prompt, so the column overlapped the one thing
 * under it and left a bare band above it.
 *
 * The piles keep the 240 they have always had; the strip gets what is left,
 * which it now fills.
 */
const HANDS_TOP = 56;
const HANDS_BOTTOM = 64;
const HANDS_GAP = 16;
const HANDS_COLUMN = TABLE_DESIGN.height - HANDS_TOP - HANDS_BOTTOM;
const HANDS_PILE_ROOM = { width: TABLE_DESIGN.width - 40, height: 240 };
const HANDS_STRIP_ROOM = {
  width: TABLE_DESIGN.width - 40,
  height: HANDS_COLUMN - HANDS_GAP - HANDS_PILE_ROOM.height,
};

/** Derived rather than written down: the centre view's container is symmetric,
 * and the hands view keeps its slot at the head of its own column. */
const centrePilesAt = (band: NameRung["band"]) => ({
  x: TABLE_DESIGN.width / 2,
  y: (band.top + (TABLE_DESIGN.height - band.bottom)) / 2,
});
const handsPilesAt = () => ({
  x: TABLE_DESIGN.width / 2,
  y: HANDS_TOP + HANDS_PILE_ROOM.height / 2,
});

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
function Waiting({
  room,
  fling,
  settings,
}: {
  room: RoomView;
  fling: SeatFling | null;
  /** The cog, in the same corner it is in during a hand (#438). */
  settings: ReactNode;
}) {
  const link = joinLink(room.code);
  const { band } = nameRung(spotsOf(room.seats));

  return (
    <>
      <EdgeNames room={room} drag={fling} />

      <div className={TOP_ROW}>
        <div className={TOP_CLUSTER}>{settings}</div>
      </div>

      {/* Stacked, a code worth crossing a room for plus the room code under it came
          to more than the board is tall. */}
      <div
        style={{ top: band.top, bottom: band.bottom, left: band.side, right: band.side }}
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
  settings,
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
  /** The cog, drawn as the first item of the row along the top (#438). Built by
   * the caller because the waiting state shows the same one. */
  settings: ReactNode;
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

  /**
   * The ruling being watched, which this screen holds the bottom band still for
   * (#382). No `caughtHold` in it: there is no "you" here to catch, so it is the
   * peel and the announcement and nothing else.
   */
  const judging = peeling || announcing;

  /** One reading of the line, styled three ways below rather than computed three
   * times — the two quiet branches used to call this without the arguments that
   * outrank the turn, which is only harmless while their own conditions rule
   * those arguments out. */
  const prompt = turnPrompt(game, nameOf, false, false, judging, reshuffling, departed);

  /** Which way up the board says things (#160). Two positions rather than four —
   * see `facing.ts` for why the prompt cannot be stood on its end. */
  const turn = facingTurn(room, game);

  /** How big the names are, and therefore how deep the bands and how wide the
   * prompt (#320). A property of the seat count, so every screen looking at this
   * room draws the same board. */
  const rung = nameRung(spotsOf(room.seats));

  // A card in the air has to leave the deck that is actually on screen.
  const pileRoom = view === "hands" ? HANDS_PILE_ROOM : centrePileRoom(rung.band);
  const pilesAt = view === "hands" ? handsPilesAt() : centrePilesAt(rung.band);

  /**
   * The cards in the air, and what the pile draws while they are (#449). Both
   * come off one hook because they are one fact: the state's top card is the one
   * that has *finished* arriving, and this board spends 840ms flying it there.
   */
  const { flights, pile } = useBoardFlights({
    game,
    log,
    places: {
      seats: room.seats,
      // The deck and the pile move with the view, and a card has to leave the
      // one that is actually on screen (#164).
      deck: deckPoint(pileRoom, pilesAt, "xl"),
      pile: pilePoint(pileRoom, pilesAt, "xl"),
      design: TABLE_DESIGN,
    },
  });

  /**
   * The only thing this board has to say to the motion layer. There are no DOM
   * anchors here — flights are aimed in design coordinates (#200) — and nothing
   * arrives into a hand, so the rest is `NO_MOTION`'s and `Piles` needs no second
   * way of being told.
   */
  const motion = useMemo<MotionApi>(
    () => ({ ...NO_MOTION, pileFace: (actual) => faceOf(pile, actual) }),
    [pile],
  );

  const piles = (
    // Around the piles alone, because the pile face is the whole of what this
    // board has to say: everything else in here is already reading `NO_MOTION`
    // and must go on reading it.
    <MotionContext value={motion}>
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
    </MotionContext>
  );

  return (
    <>
      {/* The hand strip names everybody itself. */}
      {view === "center" ? (
        <EdgeNames room={room} game={game} asking={asking} drag={fling} />
      ) : null}
      <TableFlights
        flights={flights}
        irl={room.irl}
        scale={fitScale(pileRoom, pileBox("xl"))}
        paint={boardScale}
      />

      {/* One row, one size, one baseline (#438). No name reaches the top corners,
          and the board is composed around the piles, so anything above them is
          the first thing the peel lands on. */}
      <div className={TOP_ROW}>
        <div className={TOP_CLUSTER}>
          {settings}
          {/* Four grey characters in a `<p>` until #162, and the only surface in
              the app where the code was not tappable. */}
          <button
            type="button"
            aria-label={`Invite to room ${room.code}`}
            aria-haspopup="dialog"
            onClick={onShowInvite}
            className={TOP_CONTROL}
          >
            <QrGlyph />
          </button>
        </div>

        {/* Two icons rather than two words (#168): a word in a corner reads as a
            heading for the view you are in about as readily as a way out of it.
            One of the four pieces that turn to face whoever is up (#160). */}
        <button
          type="button"
          className={TOP_CONTROL}
          style={{ transform: `rotate(${turn}deg)` }}
          onClick={onToggleView}
          aria-label={view === "center" ? "Show every hand" : "Show the middle of the table"}
        >
          {view === "center" ? <HandsIcon /> : <CentreIcon />}
        </button>
      </div>

      {view === "hands" ? (
        <div
          style={{ top: HANDS_TOP, bottom: HANDS_BOTTOM, left: 20, right: 20 }}
          className="absolute flex flex-col items-center"
        >
          <div
            style={{ height: HANDS_PILE_ROOM.height }}
            className="flex shrink-0 items-center justify-center"
          >
            <ScaledPiles room={pileRoom} outer={boardScale}>
              {piles}
            </ScaledPiles>
          </div>
          {/* The strip flips, and only the strip (#163). 180° swaps top for bottom, so
            a turned panel puts the piles under the prompt pinned to the bottom
            band — and the piles inside would be turned twice, which is no turn
            at all. */}
          {/* Centred in what is left, because a strip the board's width cannot
            grow into is a strip with slack above and below rather than a hole
            under it (#439). */}
          <div className="flex min-h-0 w-full flex-1 items-center">
            {/* On a box the size of the strip, not the box that *holds* it: `flex-1`
              fills the height that is left, so turning that swings the strip to
              the bottom. */}
            <div className="w-full" style={{ transform: `rotate(${turn}deg)` }}>
              <Seats room={room} game={game} shouts={shouts} fill={HANDS_STRIP_ROOM} />
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            top: rung.band.top,
            bottom: rung.band.bottom,
            left: rung.band.side,
            right: rung.band.side,
          }}
          className="absolute flex items-center justify-center"
        >
          <ScaledPiles room={pileRoom} outer={boardScale}>
            {piles}
          </ScaledPiles>
        </div>
      )}

      {/* A floating pill, so it costs the board no height, and it reads from
          whichever end of the table is playing (#160). */}
      {/* Its width is the rung's, because it and the bottom names are trading
          against one number: the names sit in the flanks either side of it, so a
          bigger name is paid for here (#320, #141). */}
      {/* **And `bottom-2`, so it is in the band it shares** (#442). It was
          `bottom-8`, and the pill is 54 design pixels tall against a band of 48:
          one line ran from 474 to 528, which is 38 above the band and well inside
          the room the piles are given, so on the centre view it was drawn across
          the bottom of the card in play and the deck's count. Two pixels off the
          floor puts it on the same centre line as the names beside it and gives
          the piles back every pixel — a reserved lane would have cost the card in
          play about a tenth of itself to fix a pill sitting too high.

          A multi-line ruling still grows up out of the band, which is accepted:
          it is the one thing at this table nobody may miss, it lasts seven
          seconds, and it starts 24 pixels lower than it used to. */}
      <div
        style={{ maxWidth: rung.prompt }}
        className="pointer-events-none absolute inset-x-0 bottom-2 z-40 mx-auto flex justify-center"
      >
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
          ) : judging || reshuffling !== null || departed !== null ? (
            // This screen has no log, so without it a reshuffle was a number changing
            // (#209) and a departure was nothing at all (#256). After the ruling,
            // for the reason the peel comes first — which is also what `judging`
            // leads with here: while the pile is peeling this band used to say
            // "step 1", the ruling, then "step 1" again (#382).
            <span className="text-amber-300">{prompt}</span>
          ) : finished ? (
            <span className="text-amber-300">{prompt}</span>
          ) : (
            <span className="text-white/60">
              <span aria-hidden className="text-amber-300">
                ▸{" "}
              </span>
              {prompt}
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
  const placed = edgeSeats(spotsOf(room.seats));
  /** How big a name is, and how long it may be. Both come off the seat count, so
   * a table of four gets names anybody can read across a room and a full table
   * gets the board it always had (#320). */
  const rung = nameRung(spotsOf(room.seats));

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
              count and ask are one type size on one baseline.

              **Sized and capped by the rung, not by a class** (#320). It was
              `text-2xl` in a `max-w-54` box — a phone's type size on the one
              surface in this app read from the far side of a table — and the
              numbers now come off the seat count, because a bigger name has to
              be paid for out of the bands and the prompt and only some tables
              have it to spend.

              **And it is no longer a grey whisper on green.** The resting pill
              carries its own dark and its name is white; the seat on the clock is
              amber and stays the loudest thing on the board. That half costs
              nothing and every rung gets it. */}
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
                fontSize: rung.size,
                lineHeight: `${rung.line}px`,
                maxWidth: rung.label,
              }}
              className={[
                "absolute left-0 top-0 flex w-max items-center gap-2",
                "whitespace-nowrap rounded-full px-3 py-1 ring-1",
                "font-semibold transition-colors",
                onClock
                  ? "bg-amber-300/20 text-amber-300 ring-amber-300/50"
                  : "bg-felt-950/75 text-white ring-white/20",
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
                  <span className="shrink-0 text-[0.55em] uppercase tracking-widest">out</span>
                ) : (
                  <span
                    className={[
                      "shrink-0 font-mono text-[0.8em] tabular-nums",
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
              {seat.hinted ? <HintedMark name={seat.name} className="text-[0.7em]" /> : null}
              <AutopilotMark
                mode={seat.autopilot}
                left={seat.left}
                name={seat.name}
                className="text-[0.55em]"
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
 *
 * **620 rather than 260** (#325). A draw was `FLIGHT_MS` + this = 480ms on a
 * board people are looking at from a metre away and mostly not looking at at all;
 * it is 840 now, which is a card you can follow across a table. It is also what
 * turns the deal back into a deal: fifteen cards start inside `DEAL_WINDOW_MS`
 * and each one used to be gone before the next few had left, so the whole thing
 * was a flicker — at 840 apiece there are cards in the air together and it reads
 * as a shower.
 *
 * The sweep timer is `last + FLIP_MS + TABLE_TRIP_MS + SWEEP_GRACE_MS` and
 * therefore moves with this by construction. That is load-bearing: a longer
 * animation without a longer sweep takes the element out of the DOM mid-flight
 * and the card vanishes.
 */
const TABLE_TRIP_MS = 620;

/** Long enough after the last flight has finished for its fade to be over. */
const SWEEP_GRACE_MS = 200;

/**
 * When a flight is over, counted from the moment its batch arrived. The figure
 * the animation is given, read back rather than approximated: the sweep that
 * takes the element out of the DOM and the pile it hands the card to (#449) are
 * both timed off it, and a sweep that ran early would take a card out mid-flight.
 */
const landsAt = (flight: LiveFlight): number =>
  flight.delay + (flight.turns ? FLIP_MS : 0) + flight.duration + TABLE_TRIP_MS;

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
function useBoardFlights({
  game,
  log,
  places,
}: {
  game: GameView;
  log: LoggedEvent[];
  places: TablePlaces;
}): { flights: LiveFlight[]; pile: PileHold } {
  const reduced = usePrefersReducedMotion();
  const seen = useRef(0);
  const sequence = useRef(0);
  /** One per batch, so a second batch arriving does not cancel the first one's
   * sweep and leave its cards in the DOM forever. */
  const sweeps = useRef(new Set<ReturnType<typeof setTimeout>>());
  /** One per card on its way to the pile — the arrival this board has no event
   * for. See `landsAt`. */
  const arrivals = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [flights, setFlights] = useState<LiveFlight[]>([]);
  const [pile, setPile] = useState<PileHold>(SETTLED);
  /** The face the pile wore before the update being animated, which is the one
   * it goes on drawing until the card in the air gets there (#449). */
  const previousTop = useRef<Card | null>(null);

  useEffect(() => {
    const sweeping = sweeps.current;
    const arriving = arrivals.current;
    return () => {
      for (const timer of sweeping) clearTimeout(timer);
      for (const timer of arriving) clearTimeout(timer);
      sweeping.clear();
      arriving.clear();
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
    const { flights: plans, emptiesPile } = planFlights(
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

    /**
     * The pile lags the state until the card gets there (#449). This board has
     * no `finish` event to hang that on — the flights are CSS animations and the
     * elements are swept in a batch — so an arrival is a timer at the same
     * figure the animation is given.
     */
    const toPile = live.filter((flight) => flight.toPile);
    if (toPile.length > 0) {
      const before = previousTop.current;
      setPile((held) => setOff(held, toPile.length, before, emptiesPile));
      for (const flight of toPile) {
        const arrival = setTimeout(() => {
          arrivals.current.delete(arrival);
          setPile((held) => landed(held, flight.card));
        }, landsAt(flight));
        arrivals.current.add(arrival);
      }
    }

    const ids = new Set(live.map((flight) => flight.id));
    const sweep = setTimeout(() => {
      sweeps.current.delete(sweep);
      setFlights((current) => current.filter((flight) => !ids.has(flight.id)));
    }, Math.max(...live.map(landsAt)) + SWEEP_GRACE_MS);
    sweeps.current.add(sweep);
  }, [log, reduced]);

  // Read by the effect above on the next batch, so it is written after it — the
  // ordering `TableMotion` keeps for the same pair of effects and the same
  // reason.
  useEffect(() => {
    previousTop.current = game.topCard;
  });

  return { flights, pile };
}

/**
 * The cards themselves. Everything about *which* card goes where is decided
 * above; this is the ink, drawn inside the board's transform so a flight
 * survives the quarter turn and every scale without one of its own.
 */
function TableFlights({
  flights,
  irl,
  scale,
  paint,
}: {
  flights: LiveFlight[];
  irl: boolean;
  /** What the piles were fitted at, so a card in the air matches them. */
  scale: number;
  /** The board's own scale, for `--paint-scale`: a card back's thread is a screen
   * measurement and must not grow with the board (#169). */
  paint: number;
}) {
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
          /* A card going to a player carries on past the edge and dissolves out
             there, because there is nothing on this board for it to land in
             (#325). A card going to the pile has somewhere to be: it arrives
             opaque, at rest, over the face the pile is handed at the same
             instant — so the swap is invisible and the sweep a moment later
             takes away a card identical to the one underneath it (#449). */
          className={`${flight.toPile ? "table-screen-land" : "table-screen-card"} pointer-events-none absolute z-30`}
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
                  <PlayingCard card={flight.card} size="xl" mirrored={irl} />
                </span>
              </span>
            ) : (
              <PlayingCard card={flight.card} size="xl" mirrored={irl} />
            )}
          </div>
        </div>
      ))}
    </>
  );
}
