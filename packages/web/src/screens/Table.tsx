import { useCallback, useEffect, useState } from "react";

import type { ClientMessage, GameView, RoomView, Suit } from "@goleta/engine";

import { EventLog } from "../components/EventLog.tsx";
import { Hand, HandSortButton, type HandMode } from "../components/Hand.tsx";
import { Piles } from "../components/Piles.tsx";
import { Seats } from "../components/Seats.tsx";
import {
  SunnyAccusePicker,
  SunnyAnnounce,
  SunnyCaught,
  SunnyExplainer,
  SuitPicker,
} from "../components/Sunny.tsx";
import { Button, Panel } from "../components/ui.tsx";
import { Graduation, HelpLink, HelpShout } from "../components/Help.tsx";
import { namerFor } from "../lib/format.ts";
import { NEXT_SORT, sortHand, type HandSort } from "../lib/sort.ts";
import { PEEL_MS } from "../motion/plan.ts";
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

/**
 * What the table is waiting for, said plainly.
 *
 * The two steps of a landed Sunny call number themselves. Read on its own,
 * "now the punishment card" tells you nothing about what happened or how much
 * of it is left, which is exactly how a player ends up wondering what hit them
 * (#66). Step three isn't a prompt — nobody is asked for it — but it is counted
 * so the numbering matches what the dialog promised.
 */
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
      return yours
        ? "☀️ Step 2 of 3 — the punishment card. Any card in your hand; it doesn't have to match."
        : `${who} owes a punishment card — step 2 of 3.`;
    }
    case "suit":
      // The namer, not the player to move — under Power of Eights the suit is
      // owed by the next seat, and under Dealer's Choice by the dealer before
      // anyone has played at all.
      return mine ? "Name a suit." : `${nameOf(game.phase.playerId)} is naming a suit.`;
    case "sunnyPlay":
      return mine
        ? "☀️ Step 1 of 3 — make the play you skipped. Tap it twice."
        : `${nameOf(game.turnPlayerId)} has to make the play they skipped — step 1 of 3.`;
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
  const [peeling, setPeeling] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  /** Whose reach you are part-way through accusing, if any. */
  const [accusing, setAccusing] = useState<string | null>(null);
  const [ackedCall, setAckedCall] = useState<number | null>(null);
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
  /**
   * Whether there is a seat behind this screen at all.
   *
   * A watcher gets the board — seats, hands, piles, the log, calls as they are
   * judged — and none of the furniture that belongs to a seat: no hand frame
   * over no cards, no sort control over nothing, no offer of help nobody can
   * take, no turn ring that will never light. `mine` is already false for them
   * everywhere it is read, so this is only about what is drawn at all.
   */
  const seated = game.you !== null;

  // A call is evidence before it's news, and news before it's a lesson. The
  // pile peels back to show what the ruling was made on, the banner says what
  // the ruling was, and the explanation waits until that has been and gone. It
  // is taught by being used, so only first-timers ever see the third part.
  //
  // The log is newest first, so this is the latest call, not the first one.
  const lastCall = log.find((entry) => entry.event.type === "sunnyCalled");
  const lastCallId = lastCall?.id;
  const call = lastCall?.event.type === "sunnyCalled" ? lastCall.event : null;
  useEffect(() => {
    if (lastCallId === undefined) return;
    setPeeling(true);
    const timer = setTimeout(() => {
      setPeeling(false);
      setAnnouncing(true);
    }, PEEL_MS);
    return () => clearTimeout(timer);
  }, [lastCallId]);

  // The seat a landed call is about gets a dialog instead of the banner. A
  // timed notice at the top of the screen is the right weight for news about
  // somebody else and much too light for a punishment you are about to be
  // walked through — see #66.
  //
  // It waits for the peel like the banner does: being shown the evidence and
  // then told what it meant is the order for the offender too, and they of all
  // people are owed a look at why.
  const caughtYou = call !== null && call.correct && call.targetId === game.you;
  const caughtHold = caughtYou && (peeling || ackedCall !== lastCallId);
  const showCaught = caughtHold && !peeling;

  // Taught to players, by having it happen to them. A spectator has no call to
  // make and a table screen has nobody to read it, so neither is stopped to be
  // taught the rule — and neither writes the "seen it" flag on the way past.
  const explainIfNew = useCallback(() => {
    if (seated && !hasSeenSunny()) setExplainSunny(true);
  }, [seated]);

  const announcementOver = useCallback(() => {
    setAnnouncing(false);
    explainIfNew();
  }, [explainIfNew]);

  const acknowledgeCaught = useCallback(() => {
    setAckedCall(lastCallId ?? null);
    setAnnouncing(false);
    explainIfNew();
  }, [lastCallId, explainIfNew]);

  /**
   * Tapping the sun no longer calls anything — it opens the picker. An
   * accusation has to name a card, so the tap that starts one can't be the tap
   * that commits it.
   *
   * Opening it also stops the bots, which is what makes three decisions fit in
   * a window paced for one tap. The server decides whether to honour that and
   * for how long; all this end does is say the picker is open, and say so again
   * when it isn't.
   */
  const startAccusing = (playerId: string): void => {
    setAccusing(playerId);
    send({ t: "composingCall", open: true });
  };

  const stopAccusing = useCallback((): void => {
    setAccusing(null);
    send({ t: "composingCall", open: false });
  }, [send]);

  const accuse = (cardId: string): void => {
    // No release sent: the call shuts its own window, which drops the hold
    // server-side. Sending one as well would only race the intent it follows.
    setAccusing(null);
    send({ t: "intent", intent: { type: "callSunny", playerId: game.you ?? "", cardId } });
  };

  // Somebody else may act — or call it first — while you're still choosing. The
  // picker goes with the window rather than sitting there offering a card you
  // can no longer name.
  const stillAccusable = game.sunnyCallable && game.sunnyTargetId === accusing;
  useEffect(() => {
    if (accusing !== null && !stillAccusable) stopAccusing();
  }, [accusing, stillAccusable, stopAccusing]);

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

  // Dead from the moment the call lands until the dialog is dismissed. The tap
  // that would have fired the forced play is very often the tail of the one
  // that drew the card you were caught for, and a punishment served before
  // you've watched the evidence and read the sentence isn't one.
  const mode: HandMode = caughtHold
    ? "idle"
    : game.phase.kind === "surrender" && game.phase.playerId === game.you
      ? "surrender"
      : mine && game.phase.kind === "sunnyPlay"
        ? "forced"
        : mine && game.phase.kind === "action"
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

  // What the dialog names: the play they were dodging, still in hand because
  // the rewind left it there, and the card the rewind took back off them.
  const legal = new Set(game.legalCardIds);
  const skipped = you?.hand.filter((card) => legal.has(card.id)) ?? [];
  const owesPunishment = (you?.hand.length ?? 0) > 1;

  return (
    <TableMotion game={game} log={log}>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-2 text-xs text-white/50">
          <span className="font-mono tracking-[0.2em] text-white/70">{room.code}</span>
          {offline ? <span className="text-amber-300">· reconnecting…</span> : null}
          {/* The host's reach for the room flag once the lobby is behind them.
              It is allowed to move mid-game precisely so a table that works out
              halfway through a hand that they are all sat together can say so,
              and a control only in the lobby would make that unreachable. */}
          {room.hostId === game.you ? (
            <Button
              variant="ghost"
              className="ml-auto px-2 py-1 text-xs"
              role="switch"
              aria-checked={room.irl}
              aria-label="We're all in the same room"
              title={
                room.irl
                  ? "Everyone's in the same room. Tap to turn it off."
                  : "Tap if you're all sitting in the same room."
              }
              onClick={() => send({ t: "setIrl", on: !room.irl })}
            >
              same room: {room.irl ? "on" : "off"}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            className={[room.hostId === game.you ? "" : "ml-auto", "px-2 py-1 text-xs"].join(" ")}
            onClick={onShowRules}
          >
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
          onCallSunny={startAccusing}
        />

        <div className="flex flex-1 flex-col justify-center gap-4 py-2">
          <Piles
            game={game}
            canDraw={mine && game.phase.kind === "action" && !finished}
            onDraw={() => send({ t: "intent", intent: { type: "drawCard", playerId: me } })}
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

        {/* Both pickers dock above your hand rather than being thrown over the
            table: each is a decision you make by reading what everyone else is
            holding, and a scrim would take the evidence away. */}
        {accusing !== null && stillAccusable && game.sunnyReach ? (
          <SunnyAccusePicker
            targetName={nameOf(accusing)}
            reach={game.sunnyReach}
            onPick={accuse}
            onCancel={stopAccusing}
          />
        ) : null}

        {game.phase.kind === "suit" && mine ? (
          <SuitPicker
            onPick={(suit: Suit) =>
              send({ t: "intent", intent: { type: "chooseSuit", playerId: me, suit } })
            }
          />
        ) : null}

        {/* Everything from here to the log belongs to a seat. A watcher is
            shown the table and nothing that implies they are at it. */}
        {seated ? (
          <div className="relative flex flex-col">
            {/* Kept clear whether or not the offer is showing, so the hand
                doesn't move under your fingers when it appears. */}
            <div className="flex min-h-7 items-center gap-2 px-1">
              {stalled ? <HelpLink onAsk={askForHelp} /> : null}
              {/* Yours alone: the server sends this to nobody else, and a missed
                  call is not something the table needs announcing. */}
              {game.sunnyLockedDraws > 0 ? (
                <span className="text-xs text-white/35" aria-live="polite">
                  <span aria-hidden>☀️</span> call missed — {game.sunnyLockedDraws} more{" "}
                  {game.sunnyLockedDraws === 1 ? "draw" : "draws"}
                </span>
              ) : null}
              {(you?.hand.length ?? 0) > 1 ? (
                <HandSortButton sort={handSort} onCycle={cycleSort} className="ml-auto" />
              ) : null}
            </div>

            {/* Your own shout, over your own cards, same as everyone else sees. */}
            {shoutingHere ? <HelpShout /> : null}

            {/* The same frame every other seat gets when the table is waiting on
                it. Your own cards aren't in the strip, so the one seat that most
                wants the highlight was the only one without it.

                On a wrapper rather than on `Hand` itself: that element scrolls
                its own overflow, and a box that clips one axis clips both, so it
                would trim its own ring. */}
            <div
              className={[
                "rounded-2xl transition-colors",
                mine ? "ring-1 ring-amber-300/60" : "",
              ].join(" ")}
            >
              <Hand
                cards={sortHand(you?.hand ?? [], handSort)}
                legalCardIds={game.legalCardIds}
                mode={mode}
                assist={assist}
                onChoose={onChooseCard}
              />
            </div>
          </div>
        ) : null}

        <EventLog log={log} nameOf={nameOf} />

        {announcing && call && !caughtYou ? (
          <SunnyAnnounce
            callerName={nameOf(call.callerId)}
            targetName={nameOf(call.targetId)}
            card={call.card}
            correct={call.correct}
            onDone={announcementOver}
            ms={ANNOUNCE_MS}
          />
        ) : null}

        {showCaught && call ? (
          <SunnyCaught
            callerName={nameOf(call.callerId)}
            skipped={skipped}
            returned={call.returned}
            owesPunishment={owesPunishment}
            onDone={acknowledgeCaught}
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
