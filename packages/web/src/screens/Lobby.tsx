import { useState } from "react";

import type { ClientMessage, RoomView } from "@goleta/engine";

import { Button, Panel } from "../components/ui.tsx";

const shareLink = (code: string): string => `${location.origin}/#/r/${code}`;

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareLink(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Room code</p>
      <p className="mt-1 font-mono text-5xl font-semibold tracking-[0.3em] text-amber-300">
        {code}
      </p>
      <Button variant="ghost" className="mt-2" onClick={() => void copy()}>
        {copied ? "Link copied" : "Copy invite link"}
      </Button>
    </div>
  );
}

export function Lobby({
  room,
  playerId,
  send,
  onShowRules,
  onLeave,
}: {
  room: RoomView;
  playerId: string | null;
  send: (message: ClientMessage) => void;
  onShowRules: () => void;
  onLeave: () => void;
}) {
  const isHost = room.hostId === playerId;
  const enough = room.seats.length >= room.minPlayers;
  const full = room.seats.length >= room.maxPlayers;
  const winner = room.lastWinnerId
    ? room.seats.find((seat) => seat.id === room.lastWinnerId)
    : undefined;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 p-5">
      <RoomCode code={room.code} />

      {winner ? (
        <Panel className="text-center">
          <p className="text-sm text-white/60">Last game</p>
          <p className="mt-1 text-lg font-semibold text-amber-300">
            {winner.name} kept the most cards
          </p>
        </Panel>
      ) : null}

      <Panel>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-white">
            At the table{" "}
            <span className="text-white/40">
              ({room.seats.length}/{room.maxPlayers})
            </span>
          </h2>
          {!enough ? (
            <span className="text-xs text-amber-300">needs {room.minPlayers}</span>
          ) : null}
        </div>

        <ul className="mt-3 space-y-1.5">
          {room.seats.map((seat) => (
            <li
              key={seat.id}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm"
            >
              <span className="font-medium text-white">{seat.name}</span>
              {seat.isHost ? (
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-300">
                  host
                </span>
              ) : null}
              {seat.bot ? (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] text-white/60">
                  bot
                </span>
              ) : null}
              {seat.id === playerId ? <span className="text-xs text-white/40">you</span> : null}
              {!seat.connected && !seat.bot ? (
                <span className="text-xs text-white/40">away</span>
              ) : null}
              {isHost && seat.id !== room.hostId ? (
                <Button
                  variant="ghost"
                  className="ml-auto px-2 py-1 text-xs"
                  onClick={() => send({ t: "removeSeat", playerId: seat.id })}
                >
                  remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>

      {isHost ? (
        <Panel className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Starting hand</span>
              <span className="font-mono text-sm text-amber-300">{room.startingHandSize} cards</span>
            </div>
            <input
              type="range"
              min={3}
              max={10}
              value={room.startingHandSize}
              onChange={(event) =>
                send({ t: "setStartingHandSize", value: Number(event.target.value) })
              }
              className="mt-2 w-full accent-amber-400"
              aria-label="Starting hand size"
            />
          </div>

          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-white">
              Hands face up
              <span className="mt-0.5 block text-xs text-white/50">
                Everyone sees every hand while people learn.
              </span>
            </span>
            <input
              type="checkbox"
              checked={room.handsVisible}
              onChange={(event) => send({ t: "setHandsVisible", value: event.target.checked })}
              className="size-6 shrink-0 accent-amber-400"
            />
          </label>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => send({ t: "addBot" })} disabled={full}>
              Add a bot
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => send({ t: "start" })}
              disabled={!enough}
            >
              {room.gamesPlayed > 0 ? "Next game" : "Deal"}
            </Button>
          </div>
        </Panel>
      ) : (
        <Panel className="text-center text-sm text-white/60">
          Waiting for {room.seats.find((seat) => seat.isHost)?.name ?? "the host"} to deal.
        </Panel>
      )}

      <div className="mt-auto flex justify-between pt-2">
        <Button variant="ghost" onClick={onShowRules}>
          How to play
        </Button>
        <Button variant="ghost" onClick={onLeave}>
          Leave
        </Button>
      </div>
    </div>
  );
}
