import { useEffect, useState } from "react";

import type { ClientMessage, GameView, RoomView, Suit } from "@goleta/engine";

import { EventLog } from "../components/EventLog.tsx";
import { Hand, type HandMode } from "../components/Hand.tsx";
import { Piles } from "../components/Piles.tsx";
import { Seats } from "../components/Seats.tsx";
import { SunnyCall, SunnyExplainer, SuitPicker } from "../components/Sunny.tsx";
import { Button, Panel } from "../components/ui.tsx";
import { namerFor } from "../lib/format.ts";
import { hasSeenSunny, markSunnySeen } from "../net/identity.ts";
import type { LoggedEvent } from "../net/useGoleta.ts";

/** What the table is waiting for, said plainly. */
const prompt = (game: GameView, nameOf: (id: string) => string): string => {
  const mine = game.waitingOn === game.you;
  switch (game.phase.kind) {
    case "over":
      return game.winnerId
        ? `${nameOf(game.winnerId)} wins, still holding cards.`
        : "Deadlock — nobody could move.";
    case "disposal": {
      const who = game.phase.playerId === game.you ? "You" : nameOf(game.phase.playerId);
      const why =
        game.phase.reason === "sunnyBadCall"
          ? "for a call that missed"
          : game.phase.reason === "sunnyPunishment"
            ? "as the punishment"
            : "";
      return `${who} ${who === "You" ? "owe" : "owes"} a card ${why}`.trim();
    }
    case "suit":
      return mine ? "Name a suit." : `${nameOf(game.turnPlayerId)} is naming a suit.`;
    case "sunnyPlay":
      return mine
        ? "Caught. Now make the play you skipped."
        : `${nameOf(game.turnPlayerId)} has to make the play they skipped.`;
    case "action":
      if (!mine) return `${nameOf(game.turnPlayerId)} to play.`;
      return game.youMustPlay
        ? "Your turn — you have a card that matches, so you have to play it."
        : "Nothing matches. Draw a card.";
  }
};

export function Table({
  room,
  game,
  log,
  send,
  onLeave,
  onShowRules,
  offline,
}: {
  room: RoomView;
  game: GameView;
  log: LoggedEvent[];
  send: (message: ClientMessage) => void;
  onLeave: () => void;
  onShowRules: () => void;
  offline: boolean;
}) {
  const [explainSunny, setExplainSunny] = useState(false);
  const nameOf = namerFor(room);
  const you = game.players.find((player) => player.id === game.you);
  const mine = game.waitingOn === game.you;
  const finished = game.status === "over";

  // The rule is taught by being used: the first time one lands, explain it.
  const lastSunny = log.find((entry) => entry.event.type === "sunnyCalled")?.id;
  useEffect(() => {
    if (lastSunny !== undefined && !hasSeenSunny()) setExplainSunny(true);
  }, [lastSunny]);

  const mode: HandMode =
    game.phase.kind === "disposal" && game.phase.playerId === game.you
      ? "dispose"
      : mine && (game.phase.kind === "action" || game.phase.kind === "sunnyPlay")
        ? "play"
        : "idle";

  /** The server stamps the real seat on every intent; this id is a courtesy. */
  const me = game.you ?? "";

  const onChooseCard = (cardId: string): void => {
    send({
      t: "intent",
      intent:
        mode === "dispose"
          ? { type: "disposeCard", playerId: me, cardId }
          : { type: "playCard", playerId: me, cardId },
    });
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2 text-xs text-white/50">
        <span className="font-mono tracking-[0.2em] text-white/70">{room.code}</span>
        <span>·</span>
        {room.hostId === game.you ? (
          // The host puts hands down whenever the table looks ready for it,
          // mid-game included — no vote, no waiting for the next deal.
          <Button
            variant="ghost"
            className="min-h-0 px-2 py-1 text-xs"
            onClick={() => send({ t: "setHandsVisible", value: !room.handsVisible })}
            title={room.handsVisible ? "Put hands down" : "Put hands up"}
          >
            {room.handsVisible ? "hands up" : "hands down"}
          </Button>
        ) : (
          <span>{room.handsVisible ? "hands up" : "hands down"}</span>
        )}
        {offline ? <span className="text-amber-300">reconnecting…</span> : null}
        <Button variant="ghost" className="ml-auto px-2 py-1 text-xs" onClick={onShowRules}>
          rules
        </Button>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onLeave}>
          leave
        </Button>
      </header>

      <Seats room={room} game={game} />

      <div className="flex flex-1 flex-col justify-center gap-4 py-2">
        <Piles
          game={game}
          canDraw={mine && game.phase.kind === "action" && !finished}
          onDraw={() => send({ t: "intent", intent: { type: "drawCard", playerId: me } })}
        />

        <p
          className={[
            "text-center text-sm",
            mine && !finished ? "font-semibold text-amber-300" : "text-white/60",
          ].join(" ")}
          aria-live="polite"
        >
          {prompt(game, nameOf)}
        </p>
      </div>

      {finished ? (
        <Panel className="text-center">
          <p className="text-lg font-semibold text-amber-300">
            {game.winnerId === game.you
              ? "You win — you kept your cards."
              : game.winnerId
                ? `${nameOf(game.winnerId)} wins.`
                : "A dead end. Nobody could move."}
          </p>
          {room.hostId === game.you ? (
            <Button variant="primary" className="mt-3" onClick={() => send({ t: "start" })}>
              Deal again
            </Button>
          ) : (
            <p className="mt-2 text-sm text-white/50">
              Waiting for {nameOf(room.hostId)} to deal again.
            </p>
          )}
        </Panel>
      ) : null}

      {mode === "dispose" ? (
        <p className="rounded-xl bg-rose-500/15 px-3 py-2 text-center text-sm text-rose-200 ring-1 ring-rose-400/30">
          Choose a card to give up. Tap it twice.
        </p>
      ) : null}

      <Hand
        cards={you?.hand ?? []}
        legalCardIds={game.legalCardIds}
        mode={mode}
        onChoose={onChooseCard}
      />

      <EventLog log={log} nameOf={nameOf} />

      {game.phase.kind === "suit" && mine ? (
        <SuitPicker
          onPick={(suit: Suit) =>
            send({ t: "intent", intent: { type: "chooseSuit", playerId: me, suit } })
          }
        />
      ) : null}

      <SunnyCall
        game={game}
        room={room}
        onCall={() => send({ t: "intent", intent: { type: "callSunny", playerId: me } })}
      />

      {explainSunny ? (
        <SunnyExplainer
          onDone={() => {
            markSunnySeen();
            setExplainSunny(false);
          }}
        />
      ) : null}
    </div>
  );
}
