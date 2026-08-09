import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { ClientMessage, GameEvent, GameView, PlayerId, RoomView } from "@goleta/engine";

import { HelpAsk } from "../components/Help.tsx";
import { Piles } from "../components/Piles.tsx";
import { QrCode } from "../components/QrCode.tsx";
import { PlayingCard, SUIT_GLYPH } from "../components/Card.tsx";
import { Seats } from "../components/Seats.tsx";
import { Button } from "../components/ui.tsx";
import { namerFor } from "../lib/format.ts";
import { fitScale, TABLE_DESIGN } from "../lib/fitScale.ts";
import { useJudgedCall } from "../lib/judgedCall.ts";
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

  // Nobody touches this screen, so nothing else will keep it awake. Held the
  // whole time it is showing a room, in the lobby and in a game alike (#81).
  useWakeLock(true);

  /**
   * One design, scaled to whatever it has been given — see `fitScale.ts`. This
   * runs at anything from a tablet at arm's length to a television across a
   * room, and every one of them should get the same picture rather than a
   * different composition.
   */
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const watch = new ResizeObserver(([entry]) => {
      if (entry) setScale(fitScale(entry.contentRect));
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  return (
    <div ref={frame} className="flex h-dvh w-full items-center justify-center overflow-hidden">
      <div
        style={{
          width: TABLE_DESIGN.width,
          height: TABLE_DESIGN.height,
          transform: `scale(${scale})`,
        }}
        className="relative flex shrink-0 flex-col items-center justify-center gap-6 p-10"
      >
        {game ? (
          <Playing
            room={room}
            game={game}
            nameOf={nameOf}
            call={call}
            peeling={peeling}
            shouts={shouts}
            log={log}
            view={view}
            onToggleView={() => setView(view === "center" ? "hands" : "center")}
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
            lost touch with should say so rather than showing a still life. */}
        {offline ? (
          <p className="text-xl text-amber-300" role="status">
            reconnecting…
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Between games, and before the first one: the way in, at the size of a room. */
function Waiting({ room }: { room: RoomView }) {
  const link = joinLink(room.code);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <EdgeNames room={room} />
      <div className="flex flex-col items-center text-center">
        <QrCode value={link} label={`Scan to join room ${room.code}`} className="w-[30rem] p-6" />
        <p className="mt-5 font-mono text-7xl font-semibold tracking-[0.18em] text-amber-300">
          {room.code}
        </p>
        <p className="mt-3 text-3xl text-white/50">{location.host}</p>
        {room.seats.length < room.minPlayers ? (
          <p className="mt-6 text-2xl text-amber-300">Needs {room.minPlayers} to deal.</p>
        ) : null}
      </div>
    </div>
  );
}

/** A game in progress: the two piles, whose turn it is, and what everyone holds. */
function Playing({
  room,
  game,
  nameOf,
  call,
  peeling,
  shouts,
  log,
  view,
  onToggleView,
  onDraw,
}: {
  room: RoomView;
  game: GameView;
  nameOf: (playerId: string) => string;
  call: ReturnType<typeof useJudgedCall>["call"];
  peeling: boolean;
  shouts: Shout[];
  log: LoggedEvent[];
  view: "center" | "hands";
  onToggleView: () => void;
  onDraw: () => void;
}) {
  const finished = game.status === "over";
  const asking = new Set(shouts.map((shout) => shout.playerId));
  const canDraw =
    room.irl && game.phase.kind === "action" && !finished && game.waitingOn !== null;
  const latest = log[0]?.event ?? null;

  return (
    <>
      <EdgeNames room={room} waitingOn={game.waitingOn} asking={asking} />
      <TableFlight event={latest} room={room} />

      {/* Out of the flow and into a corner. The board is composed around the
          piles, and a code sat above them is the first thing the peel — which
          fans well outside the pile it hangs off — would land on top of. */}
      <p className="absolute left-10 top-8 font-mono text-2xl uppercase tracking-[0.3em] text-white/25">
        {room.code}
      </p>
      <Button
        variant="ghost"
        className="absolute right-10 top-7 px-3 py-2 text-base"
        onClick={onToggleView}
      >
        {view === "center" ? "show hands" : "show center"}
      </Button>

      {view === "hands" ? (
        <div className="w-full px-20">
          <div className="mb-5 flex h-72 items-center justify-center">
            <div className="scale-[1.55]">
              <Piles
                game={game}
                canDraw={canDraw}
                onDraw={onDraw}
                irl={room.irl}
                size="xl"
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
            </div>
          </div>
          <Seats room={room} game={game} shouts={shouts} onCallSunny={() => undefined} />
        </div>
      ) : (
        <>
          {/* The piles, large, and the peel when a call is judged. This screen is
          the best surface in the room for that moment: if a table has one, it
          is where everybody's eyes should already be.

          Scaled inside a box that reserves the room it takes. A transform
          reserves nothing on its own, so the scaled piles would be laid out at
          their small size and simply overlap whatever the board put next to
          them. */}
          <div className="flex h-[30rem] shrink-0 items-center justify-center">
            <div className="scale-[2.05]">
              <Piles
                game={game}
                canDraw={canDraw}
                onDraw={onDraw}
                irl={room.irl}
                size="xl"
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
            </div>
          </div>

          {/* Counts, not hands. Plus, for a
          couple of seconds, whoever has just asked for a hand: the ask is
          supposed to be heard by the room, and this screen is the room's. */}
          <ul className="mt-2 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2 px-24">
            {game.players.map((player) => {
              const onClock = game.waitingOn === player.id;
              return (
                <li
                  key={player.id}
                  className={[
                    "flex items-baseline gap-2 text-3xl",
                    player.eliminated ? "opacity-40" : "",
                    onClock ? "font-semibold text-amber-300" : "text-white/70",
                  ].join(" ")}
                >
                  <span>{nameOf(player.id)}</span>
                  <span
                    className={[
                      "font-mono tabular-nums",
                      player.cardCount <= 2 && !player.eliminated && !onClock
                        ? "text-rose-300"
                        : "opacity-60",
                    ].join(" ")}
                  >
                    {player.eliminated ? "out" : player.cardCount}
                  </span>
                  {asking.has(player.id) ? <HelpAsk className="text-2xl" /> : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="min-h-12 text-center text-4xl font-semibold" role="status">
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
    </>
  );
}

type Edge = "top" | "right" | "bottom" | "left";

const edgeFor = (index: number, count: number): Edge => {
  const t = count <= 1 ? 0 : index / count;
  if (t < 0.25) return "top";
  if (t < 0.5) return "right";
  if (t < 0.75) return "bottom";
  return "left";
};

const edgeStyle = (index: number, count: number): { className: string; style: CSSProperties } => {
  const edge = edgeFor(index, count);
  const perEdge = Math.ceil(Math.max(count, 1) / 4);
  const slot = index % perEdge;
  const along = count <= 1 ? 50 : 15 + (slot * 70) / Math.max(perEdge - 1, 1);

  if (edge === "top") {
    return { className: "-translate-x-1/2", style: { left: `${along}%`, top: 18 } };
  }
  if (edge === "right") {
    return { className: "-translate-y-1/2 rotate-90", style: { right: 18, top: `${along}%` } };
  }
  if (edge === "bottom") {
    return {
      className: "-translate-x-1/2 rotate-180",
      style: { left: `${100 - along}%`, bottom: 18 },
    };
  }
  return {
    className: "-translate-y-1/2 -rotate-90",
    style: { left: 18, top: `${100 - along}%` },
  };
};

function EdgeNames({
  room,
  waitingOn = null,
  asking = new Set<PlayerId>(),
}: {
  room: RoomView;
  waitingOn?: PlayerId | null;
  asking?: ReadonlySet<PlayerId>;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {room.seats.map((seat, index) => {
        const placed = edgeStyle(index, room.seats.length);
        const active = waitingOn === seat.id;
        return (
          <div
            key={seat.id}
            style={placed.style}
            className={[
              "absolute max-w-64 truncate rounded-full px-4 py-1.5 text-3xl font-semibold transition-colors",
              active ? "bg-amber-300/15 text-amber-300" : "text-white/55",
              placed.className,
            ].join(" ")}
          >
            {seat.name}
            {asking.has(seat.id) ? <HelpAsk className="ml-2 text-xl" /> : null}
          </div>
        );
      })}
    </div>
  );
}

const flightDelta = (room: RoomView, playerId: PlayerId): { dx: number; dy: number } => {
  const index = Math.max(
    0,
    room.seats.findIndex((seat) => seat.id === playerId),
  );
  switch (edgeFor(index, room.seats.length)) {
    case "top":
      return { dx: 0, dy: -330 };
    case "right":
      return { dx: 580, dy: 0 };
    case "bottom":
      return { dx: 0, dy: 330 };
    case "left":
      return { dx: -580, dy: 0 };
  }
};

function TableFlight({ event, room }: { event: GameEvent | null; room: RoomView }) {
  if (!event || event.type !== "drew") return null;
  const { dx, dy } = flightDelta(room, event.playerId);
  return (
    <div
      key={`${event.playerId}:${event.card.id}`}
      style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties}
      className="table-screen-flight pointer-events-none absolute left-1/2 top-1/2 z-30"
    >
      <PlayingCard card={event.card} size="lg" mirrored={room.irl} />
    </div>
  );
}
