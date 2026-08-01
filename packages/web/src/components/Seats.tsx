import type { GameView, PlayerView, RoomView } from "@goleta/engine";

import { cardAnchor, seatAnchor } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import { PlayingCard } from "./Card.tsx";

const nameFor = (room: RoomView, id: string): string =>
  room.seats.find((seat) => seat.id === id)?.name ?? "Player";

function Seat({ player, room, game }: { player: PlayerView; room: RoomView; game: GameView }) {
  const { anchor, isArriving } = useMotion();
  const onClock = game.waitingOn === player.id;
  const out = player.eliminated;

  return (
    <li
      ref={anchor(seatAnchor(player.id))}
      className={[
        "min-w-32 shrink-0 rounded-xl px-3 py-2 ring-1 transition-colors",
        onClock ? "bg-amber-400/15 ring-amber-300/60" : "bg-black/20 ring-white/10",
        out ? "opacity-45" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline gap-2">
        <span className="truncate text-sm font-semibold text-white">
          {nameFor(room, player.id)}
        </span>
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

export function Seats({ room, game }: { room: RoomView; game: GameView }) {
  const others = game.players.filter((player) => player.id !== game.you);
  return (
    <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Other players">
      {others.map((player) => (
        <Seat key={player.id} player={player} room={room} game={game} />
      ))}
    </ul>
  );
}
