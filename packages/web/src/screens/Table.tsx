import { useCallback, useEffect, useState } from "react";

import type { ClientMessage, GameView, RoomView, Suit } from "@goleta/engine";

import { EventLog } from "../components/EventLog.tsx";
import { Hand, HandSortButton, type HandMode } from "../components/Hand.tsx";
import { Piles } from "../components/Piles.tsx";
import { Seats } from "../components/Seats.tsx";
import { SunnyAnnounce, SunnyExplainer, SuitPicker } from "../components/Sunny.tsx";
import { Button, Panel } from "../components/ui.tsx";
import { Graduation, HelpLink, HelpShout } from "../components/Help.tsx";
import { namerFor } from "../lib/format.ts";
import { NEXT_SORT, sortHand, type HandSort } from "../lib/sort.ts";
import { TableMotion } from "../motion/TableMotion.tsx";
import {
  gamesFinished,
  hasSeenSunny,
  loadHandSort,
  markSunnySeen,
  recordGameFinished,
  saveHandSort,
  wantsFirstGameHints,
} from "../net/identity.ts";
import type { LoggedEvent, Shout } from "../net/useGoleta.ts";

/** How long the table looks at "X called it on Y" before anything else. */
const ANNOUNCE_MS = 3200;

/** How long you can sit on a turn before the app offers you a hand. */
const STALL_MS = 5000;

/** What the table is waiting for, said plainly. */
const prompt = (game: GameView, nameOf: (id: string) => string, assist: boolean): string => {
  const mine = game.waitingOn === game.you;
  switch (game.phase.kind) {
    case "over":
      return game.winnerId
        ? `${nameOf(game.winnerId)} wins, still holding cards.`
        : "Deadlock — nobody could move.";
    case "surrender": {
      const yours = game.phase.playerId === game.you;
      const who = yours ? "You" : nameOf(game.phase.playerId);
      if (game.phase.reason === "sunnyBadCall") {
        return yours
          ? "That call missed. Give up a card — it goes to the bottom of the pile."
          : `${who} owes a card for a call that missed.`;
      }
      return yours
        ? "Now the punishment card. Any card in your hand — it doesn't have to match."
        : `${who} owes a punishment card.`;
    }
    case "suit":
      return mine ? "Name a suit." : `${nameOf(game.turnPlayerId)} is naming a suit.`;
    case "sunnyPlay":
      return mine
        ? "Caught. Make the play you skipped."
        : `${nameOf(game.turnPlayerId)} has to make the play they skipped.`;
    case "action":
      if (!mine) return `${nameOf(game.turnPlayerId)} to play.`;
      // Both of these give the answer away — being told you *must* play is
      // being told a card matches — so neither is said unless help is on.
      if (!assist) return "Your turn.";
      return game.youMustPlay
        ? "Your turn — you have a card that matches, so you have to play it."
        : "Nothing matches. Draw a card.";
  }
};

export function Table({
  room,
  game,
  log,
  shouts,
  send,
  onLeave,
  onShowRules,
  offline,
}: {
  room: RoomView;
  game: GameView;
  log: LoggedEvent[];
  shouts: Shout[];
  send: (message: ClientMessage) => void;
  onLeave: () => void;
  onShowRules: () => void;
  offline: boolean;
}) {
  const [explainSunny, setExplainSunny] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [finishedGames, setFinishedGames] = useState(gamesFinished);
  const [graduating, setGraduating] = useState(false);
  const [helpedTurn, setHelpedTurn] = useState<number | null>(null);
  const [stalled, setStalled] = useState(false);
  const [handSort, setHandSort] = useState<HandSort>(loadHandSort);
  const [wantedHints] = useState(wantsFirstGameHints);
  const nameOf = namerFor(room);
  const you = game.players.find((player) => player.id === game.you);
  const mine = game.waitingOn === game.you;
  const finished = game.status === "over";

  // A call is news before it's a lesson: everyone gets told who called it on
  // whom, and the explanation waits until that banner has been and gone. It is
  // taught by being used, so only first-timers ever see the second part.
  const lastCall = log.find((entry) => entry.event.type === "sunnyCalled");
  const lastCallId = lastCall?.id;
  const call = lastCall?.event.type === "sunnyCalled" ? lastCall.event : null;
  useEffect(() => {
    if (lastCallId !== undefined) setAnnouncing(true);
  }, [lastCallId]);

  const announcementOver = useCallback(() => {
    setAnnouncing(false);
    if (!hasSeenSunny()) setExplainSunny(true);
  }, []);

  const callSunny = (): void =>
    send({ t: "intent", intent: { type: "callSunny", playerId: game.you ?? "" } });

  /**
   * Whether the table is marking up your playable cards. Your first game can
   * come with the guardrails on if you asked for them on the way in; after that
   * they're something you ask for, one turn at a time. Being caught out having
   * a play you didn't make is the whole subject of the Sunny Rule, and an app
   * that points at the answer never lets anyone be caught.
   *
   * Making the play you skipped is the exception: you've already been caught,
   * the move is forced, and there is nothing left to fumble.
   */
  const learning = finishedGames === 0 && wantedHints;
  const assist =
    game.phase.kind === "sunnyPlay" || learning || helpedTurn === game.turnNumber;

  // One count per game actually watched to the end. Keyed off the event rather
  // than the status so that coming back to a finished room doesn't count again.
  const lastGameOverId = log.find((entry) => entry.event.type === "gameOver")?.id;
  useEffect(() => {
    if (lastGameOverId === undefined || game.you === null) return;
    const played = recordGameFinished();
    setFinishedGames(played);
    // Only worth announcing to somebody who had the highlights to lose.
    if (played === 1 && wantedHints) setGraduating(true);
  }, [lastGameOverId, game.you, wantedHints]);

  // Five seconds on a turn you haven't moved on, and the app offers a hand.
  // Every fresh draw restarts the clock: you're deciding again.
  const couldUseHelp = mine && game.phase.kind === "action" && !finished && !assist;
  useEffect(() => {
    setStalled(false);
    if (!couldUseHelp) return;
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, [couldUseHelp, game.turnNumber, game.drawsThisTurn]);

  const askForHelp = (): void => {
    setHelpedTurn(game.turnNumber);
    setStalled(false);
    send({ t: "help" });
  };

  const cycleSort = (): void => {
    const next = NEXT_SORT[handSort];
    setHandSort(next);
    saveHandSort(next);
  };

  const shoutingHere = shouts.some((shout) => shout.playerId === game.you);

  const mode: HandMode =
    game.phase.kind === "surrender" && game.phase.playerId === game.you
      ? "surrender"
      : mine && (game.phase.kind === "action" || game.phase.kind === "sunnyPlay")
        ? "play"
        : "idle";

  /** The server stamps the real seat on every intent; this id is a courtesy. */
  const me = game.you ?? "";

  const onChooseCard = (cardId: string): void => {
    send({
      t: "intent",
      intent:
        mode === "surrender"
          ? { type: "surrenderCard", playerId: me, cardId }
          : { type: "playCard", playerId: me, cardId },
    });
  };

  return (
    <TableMotion game={game} log={log}>
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-2 text-xs text-white/50">
          <span className="font-mono tracking-[0.2em] text-white/70">{room.code}</span>
          {offline ? <span className="text-amber-300">· reconnecting…</span> : null}
          <Button variant="ghost" className="ml-auto px-2 py-1 text-xs" onClick={onShowRules}>
            rules
          </Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onLeave}>
            leave
          </Button>
        </header>

        <Seats
          room={room}
          game={game}
          shouts={shouts}
          onCallSunny={callSunny}
        />

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
            {prompt(game, nameOf, assist)}
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

        {mode === "surrender" ? (
          <p className="rounded-xl bg-rose-500/15 px-3 py-2 text-center text-sm text-rose-200 ring-1 ring-rose-400/30">
            Choose any card to give up — it doesn't have to match. Tap it twice.
          </p>
        ) : null}

        {/* Docked above your hand rather than thrown over the table: naming a
            suit well means reading what everyone else is holding. */}
        {game.phase.kind === "suit" && mine ? (
          <SuitPicker
            onPick={(suit: Suit) =>
              send({ t: "intent", intent: { type: "chooseSuit", playerId: me, suit } })
            }
          />
        ) : null}

        <div className="relative flex flex-col">
          {/* Kept clear whether or not the offer is showing, so the hand
              doesn't move under your fingers when it appears. */}
          <div className="flex min-h-7 items-center gap-2 px-1">
            {stalled ? <HelpLink onAsk={askForHelp} /> : null}
            {(you?.hand.length ?? 0) > 1 ? (
              <HandSortButton sort={handSort} onCycle={cycleSort} className="ml-auto" />
            ) : null}
          </div>

          {/* Your own shout, over your own cards, same as everyone else sees. */}
          {shoutingHere ? <HelpShout /> : null}

          <Hand
            cards={sortHand(you?.hand ?? [], handSort)}
            legalCardIds={game.legalCardIds}
            mode={mode}
            assist={assist}
            onChoose={onChooseCard}
          />
        </div>

        <EventLog log={log} nameOf={nameOf} />

        {announcing && call ? (
          <SunnyAnnounce
            callerName={nameOf(call.callerId)}
            targetName={nameOf(call.targetId)}
            correct={call.correct}
            onDone={announcementOver}
            ms={ANNOUNCE_MS}
          />
        ) : null}

        {explainSunny ? (
          <SunnyExplainer
            onDone={() => {
              markSunnySeen();
              setExplainSunny(false);
            }}
          />
        ) : null}

        {graduating ? <Graduation onDone={() => setGraduating(false)} /> : null}
      </div>
    </TableMotion>
  );
}
