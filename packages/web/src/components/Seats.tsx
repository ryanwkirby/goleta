import type { GameView, PlayerView, RoomView } from "@goleta/engine";

import { cardAnchor, seatAnchor } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import type { Shout } from "../net/useGoleta.ts";
import { PlayingCard } from "./Card.tsx";
import { HelpShout } from "./Help.tsx";
import { SunnySign } from "./Sunny.tsx";

const nameFor = (room: RoomView, id: string): string =>
  room.seats.find((seat) => seat.id === id)?.name ?? "Player";

/**
 * The sun belongs to whoever is on the clock, and it only tells while the
 * player who drew is still that person — after they play and the turn moves
 * on, the window can still be open, but pointing a glow at the next seat would
 * be accusing the wrong head.
 */
const sunFor = (game: GameView, playerId: string): "idle" | "callable" | "telling" | null => {
  if (game.turnPlayerId !== playerId) return null;
  if (!game.sunnyCallable) return "idle";
  return game.sunnyWouldLand && game.sunnyTargetId === playerId ? "telling" : "callable";
};

function Seat({
  player,
  room,
  game,
  shouting,
  onCallSunny,
}: {
  player: PlayerView;
  room: RoomView;
  game: GameView;
  shouting: boolean;
  onCallSunny: () => void;
}) {
  const { anchor, isArriving } = useMotion();
  const onClock = game.waitingOn === player.id;
  const out = player.eliminated;
  const sun = sunFor(game, player.id);

  return (
    <li
      ref={anchor(seatAnchor(player.id))}
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
            targetName={game.sunnyTargetId ? nameFor(room, game.sunnyTargetId) : undefined}
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
      <div className="mt-1.5 flex flex-wrap gap-1">
        {player.hand.map((card) => (
          <PlayingCard
            key={card.id}
            card={card}
            size="sm"
            anchor={anchor(cardAnchor(card.id))}
            arriving={isArriving(card.id)}
          />
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
  const others = game.players.filter((player) => player.id !== game.you);
  const shouting = new Set(shouts.map((shout) => shout.playerId));
  return (
    <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Other players">
      {others.map((player) => (
        <Seat
          key={player.id}
          player={player}
          room={room}
          game={game}
          shouting={shouting.has(player.id)}
          onCallSunny={onCallSunny}
        />
      ))}
    </ul>
  );
}
