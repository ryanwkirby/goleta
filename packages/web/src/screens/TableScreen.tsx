import { useLayoutEffect, useRef, useState } from "react";

import type { GameView, RoomView } from "@goleta/engine";

import { HelpAsk } from "../components/Help.tsx";
import { Piles } from "../components/Piles.tsx";
import { QrCode } from "../components/QrCode.tsx";
import { SUIT_GLYPH } from "../components/Card.tsx";
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
 * **No hands, at any size.** The hands stay on the phones. A screen in the
 * middle of a room is visible to everyone including whoever is walking past,
 * and the fan that fits eight readable hands onto a shared display is a layout
 * problem the phone already solves better. It cannot act either — no play, no
 * draw, no suit, no Sunny call — and that is not enforced here but at the
 * server, which refuses every seated message from a watcher.
 *
 * It joins as a watcher (#16) on a URL of its own, so a device can be pointed
 * at it once and left there. A watcher's `GameView` arrives with `you: null`,
 * `sunnyCallable: false` and `sunnyReach: null`, and everything drawn below is
 * already in it — no protocol change, no engine change.
 *
 * Deliberately drawn without `TableMotion`. Cards flying between hands nobody
 * can see would be describing movement this screen doesn't show, and the flight
 * layer portals out to the body where the board's own scaling can't reach it.
 * The one animation that matters here is the peel, and that is CSS on the pile.
 */
export function TableScreen({
  room,
  game,
  log,
  shouts,
  offline,
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
}) {
  const nameOf = namerFor(room);
  const { call, peeling } = useJudgedCall(log);

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
    <>
      <div className="flex items-center gap-12">
        <div className="text-center">
          <p className="text-2xl font-semibold uppercase tracking-[0.3em] text-white/40">Room</p>
          <p className="font-mono text-9xl font-semibold tracking-[0.15em] text-amber-300">
            {room.code}
          </p>
          {/* Where to type it, for anyone whose camera won't play ball. Read
              off `location` like the QR is, so it is right on the deployed
              origin and on a phone pointed at the dev server alike. */}
          <p className="mt-4 text-2xl text-white/50">{location.host}</p>
        </div>
        {/* The thing latecomers point a camera at, at the size of a table. */}
        <QrCode value={link} label={`Scan to join room ${room.code}`} className="w-64 p-4" />
      </div>

      <div className="text-center">
        <p className="text-xl uppercase tracking-widest text-white/40">
          Players ({room.seats.length}/{room.maxPlayers})
        </p>
        <p className="mt-3 max-w-4xl text-balance text-4xl font-semibold text-white">
          {room.seats.length > 0
            ? room.seats.map((seat) => seat.name).join(" · ")
            : "Nobody yet."}
        </p>
        {room.seats.length < room.minPlayers ? (
          <p className="mt-4 text-2xl text-amber-300">
            Needs {room.minPlayers} to deal.
          </p>
        ) : null}
      </div>
    </>
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
}: {
  room: RoomView;
  game: GameView;
  nameOf: (playerId: string) => string;
  call: ReturnType<typeof useJudgedCall>["call"];
  peeling: boolean;
  shouts: Shout[];
}) {
  const finished = game.status === "over";
  const asking = new Set(shouts.map((shout) => shout.playerId));

  return (
    <>
      {/* Out of the flow and into a corner. The board is composed around the
          piles, and a code sat above them is the first thing the peel — which
          fans well outside the pile it hangs off — would land on top of. */}
      <p className="absolute left-10 top-8 font-mono text-2xl uppercase tracking-[0.3em] text-white/25">
        {room.code}
      </p>

      {/* The piles, large, and the peel when a call is judged. This screen is
          the best surface in the room for that moment: if a table has one, it
          is where everybody's eyes should already be.

          Scaled inside a box that reserves the room it takes. A transform
          reserves nothing on its own, so the scaled piles would be laid out at
          their small size and simply overlap whatever the board put next to
          them. */}
      <div className="flex h-64 shrink-0 items-center justify-center">
        <div className="scale-[1.7]">
          <Piles
            game={game}
            canDraw={false}
            onDraw={() => undefined}
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

      {/* Counts, not hands — see the note at the top of this file. Plus, for a
          couple of seconds, whoever has just asked for a hand: the ask is
          supposed to be heard by the room, and this screen is the room's. */}
      <ul className="mt-4 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2">
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
              {/* No name on it: it is already sitting next to theirs. */}
              {asking.has(player.id) ? <HelpAsk className="text-2xl" /> : null}
            </li>
          );
        })}
      </ul>

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
