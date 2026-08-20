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
 * The middle of the table, on a screen in the middle of the table.
 *
 * An optional extra device — a spare tablet, a laptop, a television — propped
 * where everyone can see it, holding the thing that is genuinely shared: the
 * piles. Most tables won't have one, which is why the phone view carries its own
 * peek strip and why nothing anywhere depends on this existing.
 *
 * The default is the shared centre; a toggle can show the same hand strip a
 * watcher sees. It joins as a watcher (#16) with a `table` bit on the watch
 * message, which buys one narrow auxiliary action: tapping the draw pile in an
 * IRL room draws for the current player. It has no identity, cannot play cards,
 * name suits or call Sunny.
 *
 * Deliberately drawn without `TableMotion`: this screen has its own scaled
 * coordinate system, and the flight layer portals to the body.
 *
 * **Every piece is placed against the design box rather than stacked in a
 * column** (#141). The board used to be a `flex-col` whose children came to more
 * than the height it had, and `justify-center` pushed the surplus straight
 * through the names pinned to the edges. Bands are reserved on all four sides.
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
  /** Asking for help is public, and this is the most public surface in the room.
   * A name and a word — no cards. */
  shouts: Shout[];
  offline: boolean;
  send: (message: ClientMessage) => void;
}) {
  const nameOf = namerFor(room);
  const { call, peeling, announcing, endAnnouncement } = useJudgedCall(log);

  /**
   * The ruling's own clock. This screen rendered on `call && !peeling`, and
   * `call` is just the most recent `sunnyCalled` in the log, so once the peel
   * was over the ruling was true until the *next* call — at a quiet table, the
   * rest of the game (#185). The phone's copy hangs off `SunnyAnnounce`, which
   * has the offender's dialog to dismiss it early; nobody dismisses anything on
   * a propped-up screen.
   */
  useEffect(() => {
    if (!announcing) return;
    const timer = setTimeout(endAnnouncement, ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [announcing, endAnnouncement]);
  const [view, setView] = useState<"center" | "hands">("center");
  /** The invite, off the glyph in the top-left corner (#162). This was the one
   * surface where the code was not tappable, so a table wanting to add a player
   * mid-hand had to find somebody's phone. */
  const [inviting, setInviting] = useState(false);

  // Nobody touches this screen, so nothing else will keep it awake (#81).
  useWakeLock(true);

  /**
   * One design, scaled to whatever it has been given — see `fitScale.ts`. The box
   * is kept rather than the scale because two things are read off it: how much
   * to scale by, and whether the board fits better turned a quarter (#141).
   */
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
  // without learning that hardware exists: the observer reads `contentRect`,
  // which padding is already out of. It matters more here than anywhere else,
  // since the seat names sit on the very edges of the design box — a propped
  // tablet would lose a name rather than a margin.
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
            // Read right to left: sized first, then turned. A transform changes nothing
            // about layout, so the turn costs no arithmetic elsewhere.
            transform: `${quarter ? "rotate(90deg) " : ""}scale(${scale})`,
            // How much bigger than its design size everything in here is painted. Nothing
            // inside an element can see a transform on an ancestor, so the one
            // place that knows publishes it and `bee-back` divides its thread back
            // down (#169). The quarter turn is not in it: turning changes nothing
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

        {/* A screen showing a table it has lost touch with should say so rather
            than showing a still life. In the top band's spare middle. */}
        {offline ? (
          <p
            className="absolute left-1/2 top-1.5 -translate-x-1/2 text-xl text-amber-300"
            role="status"
          >
            reconnecting…
          </p>
        ) : null}
      </div>

      {/* Outside the design box on purpose: it is about the device, not the
          board, so it must not be turned along with the picture it is asking you
          to turn. The invite is out here for a stronger version of the same
          reason — it is a panel somebody is holding a camera up to. */}
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
 * What the two views leave the piles, in design pixels. Stated rather than
 * measured because the design box is a fixed rectangle — the whole point of
 * `fitScale.ts` — so this is arithmetic a test can hold.
 */
/** Air between the piles and the bands. A name fills 46 of its 48-pixel band, so
 * piles fitted flush touch the names, which reads as the collision this was
 * fixing rather than the absence of one. */
const GUTTER = 10;

const CENTRE_PILE_ROOM = {
  width: TABLE_DESIGN.width - BAND.side * 2 - GUTTER * 2,
  height: TABLE_DESIGN.height - BAND.top - BAND.bottom - GUTTER * 2,
};
const HANDS_PILE_ROOM = { width: TABLE_DESIGN.width - 40, height: 240 };

/** The point each view centres its piles on. Both derived rather than written
 * down: the centre view's container is symmetric, and the hands view keeps its
 * slot directly under the top band. */
const CENTRE_PILES_AT = {
  x: TABLE_DESIGN.width / 2,
  y: (BAND.top + (TABLE_DESIGN.height - BAND.bottom)) / 2,
};
const HANDS_PILES_AT = {
  x: TABLE_DESIGN.width / 2,
  y: BAND.top + HANDS_PILE_ROOM.height / 2,
};

/**
 * The piles at whatever size the room they were given will take.
 *
 * The scale used to be `scale-[2.5]`, and a paint transform is invisible to the
 * layout: the piles were laid out at their unscaled size, centred in the full
 * height of the design, and the ink then grew into the band the seat names live
 * in (#159). Two halves fix it — the scale is **asked for**, so it can never
 * exceed the room, and the wrapper reserves what will actually be painted, so
 * the box the layout sees and the ink on screen are one rectangle.
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
            // Multiplied by hand rather than compounded in CSS: a custom property that
            // referred to itself would be a cycle and resolve to nothing (#169).
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

/** The two views, drawn as the thing each one shows (#168). Both are cards,
 * because that is what this screen is made of. Sized in `em` and stroked in
 * `currentColor`, so the pair take the button's own size and hover. */
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
      {/* Filled and faded first, which was unreadable: three translucent shapes
        at this size come out as one grey smudge. Outlines keep each card a card,
        and the near ones paint over the far ones. */}
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

      {/* Side by side rather than stacked. Stacked, a code worth crossing a room
          for plus the room code under it came to more than the board is tall. */}
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
          {/* What this device now is, said on the device itself: whoever scanned is
              across the table watching it light up, and this confirms the scan
              landed on the right one of the two codes in the lobby (#138). */}
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

      {/* Waiting state only, never over a game: a propped screen is set up before
          the cards come out, which is when the host is standing at it. */}
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
  /** The evidence has gone and the ruling is up. It has a life; see above. */
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
  // The same conditions the server checks, so the pile is only offered when the
  // tap will land — including the bot one: a bot's turn passes under a finger
  // already on its way down, and nothing off this screen moves a bot.
  const seatOnClock = room.seats.find((seat) => seat.id === game.waitingOn);
  const canDraw =
    room.irl &&
    game.phase.kind === "action" &&
    !finished &&
    seatOnClock !== undefined &&
    !seatOnClock.bot;
  const latest = log[0]?.event ?? null;

  /** Off the same hook the phones read, so the five seconds are the same five
   * seconds everywhere (#209). */
  const { drawPileSize: reshuffling } = useReshuffle(log);

  /**
   * Which way up this board says things (#160). Four pieces turn together: the
   * prompt, the deck count, the view toggle and the suit at the pile. Two
   * positions rather than four — see `facing.ts` for why the prompt cannot be
   * stood on its end.
   */
  const turn = facingTurn(room, game);

  // Which view is up decides where the deck is, and a card in the air has to leave
  // the deck that is actually on screen.
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
      {/* The hand strip names everybody itself, so the edges would say it twice. */}
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

      {/* Both in the top band's corners, which no name reaches: the board is
          composed around the piles, so anything above them is the first thing
          the peel would land on. */}

      {/* Four grey characters in a `<p>` until #162, and the only surface in the
          app where the code was not tappable. Now it is the same invite the
          phones open, off the same glyph. */}
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

      {/* Two icons rather than two words (#168): everything else up here is a
          glyph or a number, and a word in a corner reads as a heading for the
          view you are in about as readily as a way out of it. */}
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
          {/*
            The strip flips, and only the strip (#163). Turning the whole panel
            is wrong twice: 180° swaps top for bottom, so the piles land under
            the prompt pinned to the bottom band — and the piles inside would be
            turned by the panel *and* by their own `turn`, coming to no turn at
            all. One transform on the container, so `Seats` never learns.
          */}
          <div className="min-h-0 w-full flex-1">
            {/*
              The turn goes on a box the size of the strip, not the box that
              *holds* it: `flex-1` fills the height that is left and the strip
              sits at the top of it, so turning that box swings the strip to the
              bottom, into the prompt pinned there.
            */}
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

      {/* A floating pill over the bottom of the table, so it costs the board no
          height. It stays in its band and reads from whichever end is playing
          (#160). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 z-40 mx-auto flex max-w-128 justify-center">
        <p
          style={{ transform: `rotate(${turn}deg)` }}
          className="rounded-2xl bg-felt-950/80 px-6 py-3 text-balance text-center text-2xl font-semibold leading-tight shadow-2xl backdrop-blur-sm"
          role="status"
        >
          {announcing && call ? (
            // The ruling, once the evidence has been and gone. It holds the band for
            // the announce beat and then gives it back — a game can end on the
            // play a landed call forced, so this comes before `finished`.
            <span className="text-amber-300">
              <span aria-hidden>☀️</span> {nameOf(call.callerId)} called it on{" "}
              {nameOf(call.targetId)} — said the {call.card.rank}
              {SUIT_GLYPH[call.card.suit]}.{" "}
              <span className="text-white/70">{call.correct ? "Right." : "Wrong."}</span>
            </span>
          ) : reshuffling !== null ? (
            // The deck running out, in the band the prompt and the ruling share. This
            // screen has no log, so without it a reshuffle was a number changing
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
 * The names round the edge, each turned to be read by whoever is sitting there,
 * and each carrying that seat's count — two lists of the same players, one
 * stacked under the piles, was most of what used to overflow.
 *
 * Placed by their own centre point so the turn happens about the middle of the
 * label: positioned by an edge and then rotated, a long name on the left swung a
 * third of the way into the board.
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
        // The same point a card drawn by this seat is thrown at (#164), which is
        // why it is worked out in `tableEdges.ts` rather than here: two things
        // aiming at a seat should not each have their own idea of where it is.
        const at = seatPoint(spot, TABLE_DESIGN);
        const anchor: CSSProperties = { left: at.x, top: at.y };

        return (
          /*
            The anchor has no size of its own, and that is the load-bearing bit.
            Sized by its label, a `right`/`bottom` anchor pins the far edge of
            the *label* rather than the point, which put the right-hand names a
            third of the way into the board.
          */
          <div key={seat.id} style={anchor} className="absolute h-0 w-0">
            {/*
              Every seat is a pill and the seat on the clock is a brighter one.
              Only the active seat used to have a shape at all, so the highlight
              was a background *appearing* rather than a change of emphasis
              (#165). One size per thing, too: name, count and ask were three
              type sizes sharing one baseline. The name coming down to `text-2xl`
              is also what lets a ten-character one fit whole — see `LABEL`.
            */}
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
                  /* A word, not a number in a number's slot: being out is a state
                     rather than a very small hand. */
                  <span className="shrink-0 text-sm uppercase tracking-widest">out</span>
                ) : (
                  <span
                    className={[
                      "shrink-0 font-mono text-xl tabular-nums",
                      /* Marked whether or not it is their turn. It used to carry
                         `!onClock`, so the seat about to play the turn that
                         could finish them was the one drawn as ordinary text
                         (#170). The phone's strip never had that clause. */
                      player.cardCount <= 2 ? "text-rose-300" : "opacity-60",
                    ].join(" ")}
                  >
                    {player.cardCount}
                  </span>
                )
              ) : null}
              {/* Both, because they answer different questions: one is *this seat
                  is playing with hints on* and lasts, the other is *they just
                  said something* and does not. */}
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
 * A card leaving the deck for whoever drew it.
 *
 * It used to be one of four fixed vectors thrown from the middle of the design
 * box, which is not where the deck is — so the card appeared out of empty felt —
 * and an edge holds two seats on any table of five or more, so it was thrown at
 * the midpoint between two people (#164). Both ends now come from the same
 * arithmetic that draws the board: `deckPoint` and `seatPoint`.
 */
/**
 * The pile going back into the deck, on the one screen with no flight layer.
 * `TableMotion` is deliberately absent, so this does its own arithmetic: nine
 * face-down cards, staggered, pile → deck, over most of the five seconds (#209).
 *
 * **Face down, all of them.** The recycled pile is shuffled and its order *is*
 * deck order, which `redact.ts` guards. Nothing here gates anything — the draw
 * pile under it stays tappable and the bots carry on to their own timing.
 */
function TableRecycle({
  running,
  from,
  to,
  scale,
}: {
  /** Whether the beat is on. Null when it is not, which draws nothing. */
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
