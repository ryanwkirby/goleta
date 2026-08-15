import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { ClientMessage, GameEvent, GameView, PlayerId, RoomView } from "@goleta/engine";

import { HelpAsk } from "../components/Help.tsx";
import { Piles } from "../components/Piles.tsx";
import { QrCode, QrGlyph } from "../components/QrCode.tsx";
import { RoomInvite } from "../components/RoomInvite.tsx";
import { PlayingCard, SUIT_GLYPH } from "../components/Card.tsx";
import { Seats } from "../components/Seats.tsx";
import { TableInstall } from "../components/TableInstall.tsx";
import { TableRotateNudge } from "../components/TableRotateNudge.tsx";
import { Button } from "../components/ui.tsx";
import { facingTurn } from "../lib/facing.ts";
import { namerFor } from "../lib/format.ts";
import {
  fitScale,
  shouldTurn,
  turned,
  TABLE_DESIGN,
  type Box,
  type Point,
} from "../lib/fitScale.ts";
import { useJudgedCall } from "../lib/judgedCall.ts";
import { deckPoint, pileBox } from "../lib/pileBox.ts";
import { BAND, edgeSeats, seatPoint, TURN_FOR } from "../lib/tableEdges.ts";
import { useWakeLock } from "../lib/wakeLock.ts";
import { joinLink } from "../net/route.ts";
import type { LoggedEvent, Shout } from "../net/useGoleta.ts";

/**
 * The middle of the table, on a screen in the middle of the table.
 *
 * An optional extra device — a spare tablet, a laptop, a television — propped
 * where everyone can see it. It is the one screen the whole room is looking at,
 * so it holds the thing that is genuinely shared: the piles.
 *
 * Most tables won't have one, which is why the phone view carries its own peek
 * strip and why nothing anywhere depends on this existing.
 *
 * The default is the shared centre: edge names, the piles, the current prompt
 * and table-wide asks. A toggle can show the same hand strip a watcher sees,
 * mainly for bot-heavy rooms. The piles stay large in both views because this
 * screen is the best surface in the room for the board.
 *
 * It joins as a watcher (#16) on a URL of its own, plus a `table` bit on the
 * watch message so the server can accept one narrow auxiliary action: tapping
 * the draw pile in an IRL room draws for the current player. It still has no
 * identity, cannot play cards, cannot name suits and cannot call Sunny.
 *
 * Deliberately drawn without `TableMotion`. The shared screen uses its own
 * scaled coordinate system, so the table motion layer would land cards at body
 * coordinates. Draws get a local flight toward the player's edge; the peel is
 * still CSS on the pile and runs regardless.
 *
 * **Every piece of it is placed against the design box rather than stacked in a
 * column** (#141). The board used to be a `flex-col` whose children came to
 * more than the height it had, and `justify-center` pushed the surplus out of
 * both ends and straight through the names pinned to the edges — the counts
 * landing on the bottom names, the prompt hanging off the bottom, worse with
 * every seat. Bands are reserved for the names on all four sides and nothing is
 * drawn into them, so no arrangement of seats can collide with anything.
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
  /**
   * Asking for help is meant to be public, and this is the most public surface
   * in the room. It is a name and a word — no cards, nothing about whose turn
   * it is going well.
   */
  shouts: Shout[];
  offline: boolean;
  send: (message: ClientMessage) => void;
}) {
  const nameOf = namerFor(room);
  const { call, peeling } = useJudgedCall(log);
  const [view, setView] = useState<"center" | "hands">("center");
  /**
   * The invite, opened off the glyph in the top-left corner (#162).
   *
   * The one surface in the app where the code was not tappable, so a table
   * wanting to add a player mid-hand had to go and find somebody's phone. It
   * needs no socket — the panel is two links and the code, all of which
   * `RoomView` already carries.
   */
  const [inviting, setInviting] = useState(false);

  // Nobody touches this screen, so nothing else will keep it awake. Held the
  // whole time it is showing a room, in the lobby and in a game alike (#81).
  useWakeLock(true);

  /**
   * One design, scaled to whatever it has been given — see `fitScale.ts`. This
   * runs at anything from a tablet at arm's length to a television across a
   * room, and every one of them should get the same picture rather than a
   * different composition.
   *
   * The box is kept rather than the scale, because two things are read off it:
   * how much to scale by, and whether the board fits better turned a quarter
   * (#141). A phone standing in for a spare tablet is the case that needs the
   * second one, and it needs no code of its own — `shouldTurn` is arithmetic on
   * the same rectangle.
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

  // The inset goes on the frame, so `fitScale` fits the design into the *safe*
  // box without learning that hardware exists: the observer reads
  // `contentRect`, which padding is already out of. It stays right through the
  // quarter turn for the same reason — the padding is on the physical edges,
  // where the hardware is, and the design is fitted into whatever that leaves.
  //
  // It matters more here than anywhere else since #120 put the seat names on
  // the very edges of the design box, which is exactly where a notch or a
  // rounded corner takes its cut. A propped tablet would lose a name rather
  // than a margin.
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
            // Read right to left: sized first, then turned. A transform changes
            // nothing about layout, so the box stays centred in the frame either
            // way and the turn costs no arithmetic anywhere else on this screen.
            transform: `${quarter ? "rotate(90deg) " : ""}scale(${scale})`,
            // How much bigger than its design size everything in here is being
            // painted. Nothing inside an element can see a transform on an
            // ancestor, so the one place that knows the number publishes it —
            // and `bee-back` divides its thread back down to the width it has
            // on every other screen in the app (#169). The quarter turn is not
            // in it: turning changes nothing about how large a pixel is.
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

        {/* The one thing that isn't the game: a screen showing a table it has
            lost touch with should say so rather than showing a still life. In
            the top band's spare middle, which nothing else claims. */}
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
          board, so it must not be turned along with the picture it is asking
          you to turn. The invite is out here for the same reason and a
          stronger one — inside, it would be scaled by `fitScale` and stood on
          its side by the quarter turn, and it is a panel somebody is holding a
          camera up to. */}
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
 * What the two views leave the piles, in design pixels.
 *
 * The centre view is everything inside the bands. The hands view is the `h-60`
 * slot it keeps above the seat strip, across the width its own container has.
 * Both are stated here rather than measured because the design box is a fixed
 * rectangle — the whole point of `fitScale.ts` — so this is arithmetic a test
 * can hold rather than a layout somebody has to look at.
 */
/**
 * Air between the piles and the bands. A name fills very nearly the whole of
 * its own band — `text-3xl` and its padding come to 46 of the 48 — so piles
 * fitted to the band edge exactly are piles that touch the names, which reads
 * as the collision this was fixing rather than the absence of one.
 */
const GUTTER = 10;

const CENTRE_PILE_ROOM = {
  width: TABLE_DESIGN.width - BAND.side * 2 - GUTTER * 2,
  height: TABLE_DESIGN.height - BAND.top - BAND.bottom - GUTTER * 2,
};
const HANDS_PILE_ROOM = { width: TABLE_DESIGN.width - 40, height: 240 };

/**
 * The point each view centres its piles on, which is the other half of knowing
 * where the deck is.
 *
 * Both are derived rather than written down. The centre view's container is
 * symmetric — the same band top and bottom, the same inset either side — so it
 * is the middle of the room between the bands. The hands view keeps its slot
 * directly under the top band, with the seat strip below.
 */
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
 * layout around it: the piles were laid out at their unscaled 198px, centred in
 * the full height of the design, and then painted about their own middle — into
 * the band the seat names live in, which is how a name came to be drawn on top
 * of the draw pile (#159).
 *
 * Two halves fix it and both are needed. The scale is **asked for** rather than
 * chosen, so it can never be more than the room allows; and the wrapper reserves
 * the size that will actually be painted, so the box the layout sees and the
 * ink on the screen are the same rectangle. `pileBox` is what makes the second
 * one true — including the twelve pixels the suit circle hangs off the corner.
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
            // Multiplied by hand rather than compounded in CSS: a custom
            // property that referred to itself would be a cycle and resolve to
            // nothing at all. This is the scale the board is already applying
            // times the one applied here, which together is what the ink on the
            // draw pile is multiplied by (#169).
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

/**
 * The two views, drawn as the thing each one shows (#168).
 *
 * Both are cards, because that is what this screen is made of: the middle of
 * the table is the two piles side by side, and every hand is a fan. Sized in
 * `em` so the pair scale with whatever the button is set at, and stroked in
 * `currentColor` so they take the button's own hover.
 */
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
      {/*
        Filled and faded first, which was unreadable: three translucent shapes
        overlapping at this size come out as one grey smudge, and the ghost
        button is already drawing at 70%. Outlines keep each card a card, and
        the near ones paint over the far ones — so the fan needs no opacity to
        read as a fan.
      */}
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

      {/* Side by side rather than stacked. Stacked, the code at a size worth
          crossing a room for plus the room code under it came to more than the
          board is tall, and the bottom of it landed on the names. */}
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
          {/* What this device now is, said on the device itself. Whoever
              scanned the code is across the table watching this screen light
              up, and "shared screen" is the confirmation that the scan landed
              on the right one of the two codes in the lobby (#138). */}
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

      {/* Waiting state only, never over a game: a propped screen is set up
          before the cards come out, which is also when the host is standing at
          it — and #119's invite flow is the moment it gets put there. A pilot;
          see `TableInstall`. */}
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
  shouts,
  log,
  view,
  onToggleView,
  onShowInvite,
  onDraw,
}: {
  room: RoomView;
  /** What the board is being scaled by, for anything that has to divide it out. */
  boardScale: number;
  game: GameView;
  nameOf: (playerId: string) => string;
  call: ReturnType<typeof useJudgedCall>["call"];
  peeling: boolean;
  shouts: Shout[];
  log: LoggedEvent[];
  view: "center" | "hands";
  onToggleView: () => void;
  onShowInvite: () => void;
  onDraw: () => void;
}) {
  const finished = game.status === "over";
  const asking = new Set(shouts.map((shout) => shout.playerId));
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

  /**
   * Which way up this board says things (#160).
   *
   * The seat names have read from outside their own edge since #141 and
   * everything said in *words* was still drawn upright, so a player at the top
   * read their own name the right way up and the sentence about their own turn
   * upside down. Four pieces turn together: the prompt, the deck count, the
   * view toggle and the suit at the pile.
   *
   * Two positions rather than four — see `facing.ts` for why the prompt cannot
   * be stood on its end, and #163 for the hands view taking the same answer.
   */
  const turn = facingTurn(room, game);

  // Which view is up decides where the deck is, and a card in the air has to
  // leave the deck that is actually on screen.
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
      {/* The hand strip names everybody itself, so the edges would be saying it
          twice — and the strip is wide enough to reach them. */}
      {view === "center" ? (
        <EdgeNames room={room} game={game} asking={asking} />
      ) : null}
      <TableFlight
        event={latest}
        room={room}
        from={deckPoint(pileRoom, pilesAt, "xl")}
        scale={fitScale(pileRoom, pileBox("xl"))}
      />

      {/* Both in the top band's corners, which no name reaches: the ends of
          each edge are left free (`tableEdges.ts`), and the board is composed
          around the piles, so anything sat above them is the first thing the
          peel — which fans well outside the pile it hangs off — would land on. */}

      {/* This was four grey characters in a `<p>`, and the only surface in the
          app where the code was not tappable: a table wanting to add a player
          mid-hand had to go to somebody's phone. Now it is the same invite the
          phones open, off the same glyph (#162). */}
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

      {/* Two icons rather than two words (#168). Everything else up here is a
          glyph or a number, and a word in a corner of a board propped in the
          middle of a table reads as a heading for the view you are in about as
          readily as a way out of it. It shows where it goes, and the label says
          so for anyone not reading pictures. */}
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
            The strip flips, and only the strip (#163).

            Turning the whole panel was the first thing tried and it is wrong
            twice: 180° swaps top for bottom, so the piles land at the foot of
            the board and under the prompt pinned there — and the piles inside
            it would be turned by the panel *and* by their own `turn`, which
            comes to no turn at all. The strip is the part that has to be
            readable from the other side of the table; the piles have `turn`
            for their two bits of writing, and a card is already double-headed.

            One transform on the container, so `Seats` — the phone's own
            component — never learns this happened, and its scrolling and fan
            arithmetic are untouched.
          */}
          <div className="min-h-0 w-full flex-1">
            {/*
              The turn goes on a box the size of the strip, not on the box that
              *holds* it. `flex-1` fills the height that is left and the strip
              sits at the top of it, so turning that box about its centre swings
              the strip to the bottom — into the prompt pinned there. Turned
              about its own middle, it stays where it was drawn.
            */}
            <div style={{ transform: `rotate(${turn}deg)` }}>
              <Seats room={room} game={game} shouts={shouts} onCallSunny={() => undefined} />
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

      {/* The prompt, a floating pill over the bottom of the table so it costs
          the board no height — and the piece that decided this turns rather
          than spins. It stays in its band and reads from whichever end of the
          table is playing (#160). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 z-40 mx-auto flex max-w-128 justify-center">
        <p
          style={{ transform: `rotate(${turn}deg)` }}
          className="rounded-2xl bg-felt-950/80 px-6 py-3 text-balance text-center text-2xl font-semibold leading-tight shadow-2xl backdrop-blur-sm"
          role="status"
        >
          {finished ? (
            <span className="text-amber-300">
              {game.winnerId
                ? `${nameOf(game.winnerId)} wins, still holding cards.`
                : "A dead end. Nobody could move."}
            </span>
          ) : call && !peeling ? (
            // The ruling, once the evidence has been and gone. The whole table
            // watched the peel; this is what it came to.
            <span className="text-amber-300">
              <span aria-hidden>☀️</span> {nameOf(call.callerId)} called it on{" "}
              {nameOf(call.targetId)} — said the {call.card.rank}
              {SUIT_GLYPH[call.card.suit]}.{" "}
              <span className="text-white/70">{call.correct ? "Right." : "Wrong."}</span>
            </span>
          ) : game.waitingOn ? (
            <span className="text-white/60">
              <span aria-hidden className="text-amber-300">
                ▸{" "}
              </span>
              {nameOf(game.waitingOn)} to play
            </span>
          ) : null}
        </p>
      </div>
    </>
  );
}

/**
 * The names round the edge, each one turned to be read by whoever is sitting
 * there — and each one carrying that seat's count, which is what took the
 * separate list of counts off the board. Two lists of the same players, one of
 * them stacked under the piles, was most of what used to overflow.
 *
 * Placed by their own centre point so the turn happens about the middle of the
 * label: positioned by an edge and then rotated, a long name on the left swung
 * a third of the way into the board. The wrapper is the anchor, the inner box
 * does the turning, and the band each one sits in is reserved by `BAND`.
 */
function EdgeNames({
  room,
  game = null,
  asking = new Set<PlayerId>(),
}: {
  room: RoomView;
  game?: GameView | null;
  asking?: ReadonlySet<PlayerId>;
}) {
  const placed = edgeSeats(room.seats.length);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {room.seats.map((seat, index) => {
        const spot = placed[index];
        if (!spot) return null;
        const player = game?.players.find((candidate) => candidate.id === seat.id);
        const onClock = game?.waitingOn === seat.id;
        // The same point a card drawn by this seat is thrown at (#164), which
        // is the reason it is worked out in `tableEdges.ts` rather than here:
        // two things aiming at a seat should not each have their own idea of
        // where it is. Placed as plain `left`/`top` now that it is a point
        // rather than an inset — the label still centres itself on it below.
        const at = seatPoint(spot, TABLE_DESIGN);
        const anchor: CSSProperties = { left: at.x, top: at.y };

        return (
          /*
            The anchor has no size of its own, and that is the load-bearing bit.
            Sized by its label, a `right`/`bottom` anchor pins the far edge of
            the *label* rather than the point, and the whole thing lands a label
            short of where it was asked for — which put the right-hand names a
            third of the way into the board and the bottom ones a line high.
            Zero-sized, every edge means the same thing, and the label centres
            itself on it.
          */
          <div key={seat.id} style={anchor} className="absolute h-0 w-0">
            {/*
              Every seat is a pill, and the seat on the clock is a brighter one.
              It used to be that only the active seat had a shape at all, so the
              highlight was a background *appearing* rather than a change of
              emphasis — three names and a badge, instead of four names one of
              which is lit (#165).

              One size per thing, too. Name, count and the ask were three type
              sizes sharing one baseline, which is most of what made the row
              look thrown together; they are a hierarchy now, aligned on their
              centres. The name coming down to `text-2xl` is also what lets a
              ten-character one fit whole — see `LABEL` — and it puts a name at
              the same size as the sentence about the game rather than above it.
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
                  /* A word, not a number in a number's slot. Being out is a
                     state rather than a very small hand, and the two used to be
                     three mono characters apart. */
                  <span className="shrink-0 text-sm uppercase tracking-widest">out</span>
                ) : (
                  <span
                    className={[
                      "shrink-0 font-mono text-xl tabular-nums",
                      /* Down to a couple of cards is marked whether or not it
                         is their turn. It used to carry `!onClock`, so the seat
                         about to play the turn that could finish them — the
                         most interesting fact on the board — was the one seat
                         whose count was drawn as ordinary text (#170). The
                         phone's seat strip never had that clause. */
                      player.cardCount <= 2 ? "text-rose-300" : "opacity-60",
                    ].join(" ")}
                  >
                    {player.cardCount}
                  </span>
                )
              ) : null}
              {asking.has(seat.id) ? <HelpAsk className="shrink-0 text-lg" /> : null}
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
 * It used to be one of four fixed vectors — `dy: -330` for anybody at the top,
 * and so on — thrown from `left-1/2 top-1/2`, the middle of the design box. Two
 * things were wrong with that and both show at a real table. The middle of the
 * board is not where the deck is, so the card appeared out of empty felt beside
 * it. And an edge holds two seats on any table of five or more, which meant the
 * card was thrown at the midpoint between two people, towards neither (#164).
 *
 * Both ends are worked out from the same arithmetic that draws the board:
 * `deckPoint` off the fitting that placed the piles, `seatPoint` off the
 * placement that drew the names. So the card leaves the deck it came from and
 * arrives at the name of the person who drew it, at every seat count.
 *
 * It is drawn at the size the deck is drawn at, for the same reason — a card
 * that comes off a pile should be the size of the cards in it.
 */
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
