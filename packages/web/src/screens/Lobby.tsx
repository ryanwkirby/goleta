import { useState } from "react";

import type { BotSpeed, ClientMessage, HouseRules, RoomView } from "@goleta/engine";

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
 * What a table is playing, for everyone who isn't the host and can't see the
 * switches. Silent when the table plays the game as written.
 */
const describeRules = (rules: HouseRules): string => {
  const on: string[] = [];
  if (!rules.sunny) on.push("no Sunny Rule");
  if (rules.eights === "nextPlayerNames") on.push("the Power of Eights");
  if (rules.seedEight === "dealerNames") on.push("Dealer's Choice");
  if (on.length === 0) return "Playing the standard rules.";
  return `House rules: ${on.join(", ")}.`;
};

/**
 * The house rules, as a row of switches.
 *
 * Every one of these is a rule the game already had written down — two
 * alternates from the original rules, plus the Sunny Rule, which not every
 * table wants to play with. Defaults are the game as written, so a host who
 * never opens this gets exactly what they got before.
 *
 * Off is described as plainly as on. A table choosing to drop the Sunny Rule
 * isn't playing a lesser game, and the copy shouldn't imply it is.
 */
function HouseRulesPicker({
  rules,
  onChange,
}: {
  rules: HouseRules;
  onChange: (rules: HouseRules) => void;
}) {
  const rows: { key: string; label: string; blurb: string; on: boolean; toggle: HouseRules }[] = [
    {
      key: "sunny",
      label: "The Sunny Rule",
      blurb: rules.sunny
        ? "Draw with a play in your hand and anyone can call it on you."
        : "Off. Nobody is watching your hands, and drawing is just drawing.",
      on: rules.sunny,
      toggle: { ...rules, sunny: !rules.sunny },
    },
    {
      key: "eights",
      label: "The Power of Eights",
      blurb:
        rules.eights === "nextPlayerNames"
          ? "The next player names the suit, not whoever played the 8."
          : "Off. Play an 8 and you name the suit yourself.",
      on: rules.eights === "nextPlayerNames",
      toggle: {
        ...rules,
        eights: rules.eights === "nextPlayerNames" ? "playerNames" : "nextPlayerNames",
      },
    },
    {
      key: "seedEight",
      label: "Dealer's Choice",
      blurb:
        rules.seedEight === "dealerNames"
          ? "An 8 turned up to start is the dealer's suit to name."
          : "Off. An 8 turned up to start plays as its own suit.",
      on: rules.seedEight === "dealerNames",
      toggle: {
        ...rules,
        seedEight: rules.seedEight === "dealerNames" ? "natural" : "dealerNames",
      },
    },
  ];

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">House rules</p>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{row.label}</p>
              <p className="text-xs text-white/40">{row.blurb}</p>
            </div>
            <Button
              variant={row.on ? "primary" : "secondary"}
              className="min-w-16 px-3 py-1.5 text-xs"
              role="switch"
              aria-checked={row.on}
              aria-label={row.label}
              onClick={() => onChange(row.toggle)}
            >
              {row.on ? "On" : "Off"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
          <HouseRulesPicker
            rules={room.houseRules}
            onChange={(rules) => send({ t: "setHouseRules", rules })}
          />
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
          <span className="mt-1 block text-xs text-white/40">{describeRules(room.houseRules)}</span>
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
