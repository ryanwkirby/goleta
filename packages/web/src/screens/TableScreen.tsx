import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  ClientMessage,
  GameEvent,
  GameView,
  PlayerId,
  RoomView,
  ShoutKind,
} from "@goleta/engine";

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
import { useReshuffle } from "../lib/reshuffle.ts";
import { deckPoint, pileBox, pilePoint } from "../lib/pileBox.ts";
import { BAND, edgeSeats, seatPoint, TURN_FOR } from "../lib/tableEdges.ts";
import { useWakeLock } from "../lib/wakeLock.ts";
import { RESHUFFLE_BEAT_MS, RESHUFFLE_CARDS } from "../motion/plan.ts";
import { joinLink } from "../net/route.ts";
import type { LoggedEvent, Shout } from "../lib/feed.ts";

/**
 * The middle of the table, on an optional extra device propped where everyone
 * can see it. **Nothing anywhere depends on this existing** — the phone view
 * carries its own peek strip.
 *
 * It joins as a watcher (#16) with a `table` bit, which buys one narrow
 * auxiliary action: tapping the draw pile in an IRL room draws for the current
 * player. It cannot play, name a suit or call Sunny, and it is drawn without
 * `TableMotion` — the flight layer portals to the body, where this screen's
 * transform cannot reach it.
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
    const watch = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  const quarter = shouldTurn(box);
  const scale = fitScale(quarter ? turned(box) : box);

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
      >
        {game ? (
          <Playing
            room={room}
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
          <Waiting room={room} />
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
function Waiting({ room }: { room: RoomView }) {
  const link = joinLink(room.code);

  return (
    <>
      <EdgeNames room={room} />

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
  const latest = log[0]?.event ?? null;

  /** Off the same hook the phones read, so it is the same five seconds (#209). */
  const { drawPileSize: reshuffling } = useReshuffle(log);

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
        <EdgeNames room={room} game={game} asking={asking} />
      ) : null}
      <TableFlight
        event={latest}
        room={room}
        from={deckPoint(pileRoom, pilesAt, "xl")}
        scale={fitScale(pileRoom, pileBox("xl"))}
      />
      <TableRecycle
        running={reshuffling !== null}
        from={pilePoint(pileRoom, pilesAt, "xl")}
        to={deckPoint(pileRoom, pilesAt, "xl")}
        scale={fitScale(pileRoom, pileBox("xl"))}
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
          ) : reshuffling !== null ? (
            // This screen has no log, so without it a reshuffle was a number changing
            // (#209). After the ruling, for the reason the peel comes first.
            <span className="text-amber-300">
              {turnPrompt(game, nameOf, false, false, reshuffling)}
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
 */
function EdgeNames({
  room,
  game = null,
  asking = new Map<PlayerId, ShoutKind>(),
}: {
  room: RoomView;
  game?: GameView | null;
  asking?: ReadonlyMap<PlayerId, ShoutKind>;
}) {
  const placed = edgeSeats(room.seats.length);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {room.seats.map((seat, index) => {
        const spot = placed[index];
        if (!spot) return null;
        const player = game?.players.find((candidate) => candidate.id === seat.id);
        const onClock = game?.waitingOn === seat.id;
        // The same point a card drawn by this seat is thrown at (#164): two things
        // aiming at a seat should not each have their own idea of where it is.
        const at = seatPoint(spot, TABLE_DESIGN);
        const anchor: CSSProperties = { left: at.x, top: at.y };

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
              style={{ transform: `translate(-50%, -50%) rotate(${TURN_FOR[spot.edge]}deg)` }}
              className={[
                "absolute left-0 top-0 flex w-max max-w-54 items-center gap-2",
                "whitespace-nowrap rounded-full px-3 py-1 ring-1",
                "text-2xl font-semibold transition-colors",
                onClock
                  ? "bg-amber-300/15 text-amber-300 ring-amber-300/40"
                  : "bg-felt-950/40 text-white/60 ring-white/10",
                player?.eliminated ? "opacity-45" : "",
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

/**
 * A card leaving the deck for whoever drew it. It used to be one of four fixed
 * vectors from the middle of the design box — which is not where the deck is,
 * and an edge holds two seats on any table of five or more, so it was thrown at
 * the midpoint between two people (#164). Both ends come from the same
 * arithmetic that draws the board.
 */
/**
 * The pile going back into the deck, on the one screen with no flight layer, so
 * it does its own arithmetic (#209). **Face down, all of them**: the recycled
 * pile is shuffled and its order *is* deck order, which `redact.ts` guards. It
 * gates nothing — the draw pile under it stays tappable.
 */
function TableRecycle({
  running,
  from,
  to,
  scale,
}: {
  /** Whether the beat is on. */
  running: boolean;
  from: Point;
  to: Point;
  scale: number;
}) {
  if (!running) return null;

  return (
    <>
      {Array.from({ length: RESHUFFLE_CARDS }, (_, index) => (
        <div
          key={index}
          style={
            {
              left: from.x,
              top: from.y,
              "--dx": `${to.x - from.x}px`,
              "--dy": `${to.y - from.y}px`,
              "--delay": `${index * RESHUFFLE_BEAT_MS}ms`,
            } as CSSProperties
          }
          className="table-screen-recycle pointer-events-none absolute z-30"
        >
          <div style={{ transform: `scale(${scale})` }}>
            <CardBack size="xl" />
          </div>
        </div>
      ))}
    </>
  );
}

function TableFlight({
  event,
  room,
  from,
  scale,
}: {
  event: GameEvent | null;
  room: RoomView;
  /** Where the deck is, in design pixels — it moves with the view. */
  from: Point;
  /** What the piles were fitted at, so a card in the air matches them. */
  scale: number;
}) {
  if (!event || event.type !== "drew") return null;

  const seats = room.seats.length;
  const index = Math.max(
    0,
    room.seats.findIndex((seat) => seat.id === event.playerId),
  );
  const spot = edgeSeats(seats)[index];
  if (!spot) return null;

  const to = seatPoint(spot, TABLE_DESIGN);

  return (
    <div
      key={`${event.playerId}:${event.card.id}`}
      style={
        {
          left: from.x,
          top: from.y,
          "--dx": `${to.x - from.x}px`,
          "--dy": `${to.y - from.y}px`,
        } as CSSProperties
      }
      className="table-screen-flight pointer-events-none absolute z-30"
    >
      <div style={{ transform: `scale(${scale})` }}>
        <PlayingCard card={event.card} size="xl" mirrored={room.irl} />
      </div>
    </div>
  );
}
