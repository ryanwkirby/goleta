import { useState } from "react";

import type { BotSpeed, ClientMessage, RoomView } from "@goleta/engine";

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

const SPEEDS: { key: BotSpeed; label: string; blurb: string }[] = [
  { key: "human", label: "Human", blurb: "A few seconds a turn, like people play." },
  { key: "lightning", label: "Lightning", blurb: "As fast as the server can deal them." },
];

/**
 * Only worth showing once there's a bot to pace. It's a table setting rather
 * than a personal one — the bots are timed on the server, so everyone watches
 * the same game.
 */
function BotSpeedPicker({
  speed,
  onPick,
}: {
  speed: BotSpeed;
  onPick: (speed: BotSpeed) => void;
}) {
  const chosen = SPEEDS.find((option) => option.key === speed);

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Bot speed</p>
      <div className="mt-2 flex gap-2">
        {SPEEDS.map((option) => (
          <Button
            key={option.key}
            variant={option.key === speed ? "primary" : "secondary"}
            className="flex-1"
            aria-pressed={option.key === speed}
            onClick={() => onPick(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/40">{chosen?.blurb}</p>
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
  const anyBots = room.seats.some((seat) => seat.bot);
  const winner = room.lastWinnerId
    ? room.seats.find((seat) => seat.id === room.lastWinnerId)
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-5">
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
        <Panel>
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
          {anyBots ? (
            <BotSpeedPicker
              speed={room.botSpeed}
              onPick={(speed) => send({ t: "setBotSpeed", speed })}
            />
          ) : null}
        </Panel>
      ) : (
        <Panel className="text-center text-sm text-white/60">
          Waiting for {room.seats.find((seat) => seat.isHost)?.name ?? "the host"} to deal.
          {anyBots ? (
            <span className="mt-1 block text-xs text-white/40">
              Bots play at {room.botSpeed === "human" ? "a human" : "lightning"} speed.
            </span>
          ) : null}
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
