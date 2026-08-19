import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ClientMessage, GameView, RoomView, Suit } from "@goleta/engine";

import { EventLog } from "../components/EventLog.tsx";
import { Hand, HandSortButton, type HandMode } from "../components/Hand.tsx";
import { Piles } from "../components/Piles.tsx";
import { RotatePanel } from "../components/RotatePanel.tsx";
import { Seats } from "../components/Seats.tsx";
import { TurnGlow } from "../components/TurnGlow.tsx";
import {
  SunnyAccusePicker,
  SunnyAnnounce,
  SunnyCall,
  SunnyCaught,
  SunnyExplainer,
  SuitPicker,
} from "../components/Sunny.tsx";
import { Button, Panel } from "../components/ui.tsx";
import { Graduation, HelpLink, HelpShout } from "../components/Help.tsx";
import { HostSettingsCog } from "../components/HostSettings.tsx";
import { PlayerSettingsCog } from "../components/PlayerSettings.tsx";
import { QrGlyph } from "../components/QrCode.tsx";
import { MoveRefusal } from "../components/Refusal.tsx";
import { RoomInvite } from "../components/RoomInvite.tsx";
import { namerFor, turnPrompt, type NameOf } from "../lib/format.ts";
import { NEXT_SORT, sortHand, type HandSort } from "../lib/sort.ts";
import { handStep } from "../lib/handFan.ts";
import { useBox } from "../lib/measure.ts";
import { CARD_WIDTH_PX } from "../components/Card.tsx";
import { ANNOUNCE_MS, useJudgedCall } from "../lib/judgedCall.ts";
import { useIsPhone, useIsPortrait } from "../lib/viewport.ts";
import { useWakeLock } from "../lib/wakeLock.ts";
import { FULL_TABLE, PEEK_TABLE } from "../motion/plan.ts";
import { TableMotion, useMotion } from "../motion/TableMotion.tsx";
import {
  gamesFinished,
  gamesSeen,
  gamesToCredit,
  hasSeenSunny,
  loadHandSort,
  loadName,
  markGamesSeen,
  markSunnySeen,
  recordGamesFinished,
  saveHandSort,
} from "../net/identity.ts";
import type { GoletaError, LoggedEvent, Shout } from "../net/useGoleta.ts";
import { HandOver } from "./HandOver.tsx";
import { HandView } from "./HandView.tsx";

/**
 * How long you can sit on a turn before the app offers you a hand.
 *
 * Seven seconds, not five. Five is inside the length of an ordinary turn at a
 * table where people are talking to each other, so the offer kept turning up on
 * turns nobody was stuck on — and an offer of help you didn't need is the app
 * saying it thinks you do.
 */
const STALL_MS = 7000;

/**
 * The line that says what the table is waiting for, and the picker it asks for.
 *
 * Both are components rather than inline JSX because both have to read the
 * motion layer — the suit ask waits for the deal to finish (#75) — and `Table`
 * renders `TableMotion` rather than sitting underneath it. `HandView` is already
 * a child of the provider and reads the same two things for itself.
 */
function TurnPrompt({
  game,
  nameOf,
  assist,
}: {
  game: GameView;
  nameOf: NameOf;
  assist: boolean;
}) {
  const { dealing } = useMotion();
  const mine = game.waitingOn === game.you;
  return (
    <p
      className={[
        "text-center text-sm",
        mine && game.status !== "over" ? "font-semibold text-amber-300" : "text-white/60",
      ].join(" ")}
      aria-live="polite"
    >
      {turnPrompt(game, nameOf, assist, dealing)}
    </p>
  );
}

/**
 * The suit picker, held back until the cards are down.
 *
 * Under Dealer's Choice the game opens in `phase: "suit"`, so without this the
 * picker was up before the deal had finished — asking for a suit for an 8 that
 * had not landed yet (#75). Reduced motion plans no flights, so `dealing` is
 * never true there and the picker appears at once, with nothing waited for.
 */
function DockedSuitPicker({ onPick }: { onPick: (suit: Suit) => void }) {
  const { dealing } = useMotion();
  if (dealing) return null;
  return <SuitPicker onPick={onPick} />;
}

export function Table({
  room,
  game,
  log,
  shouts,
  refusal,
  send,
  onLeave,
  onShowRules,
  hints,
  onChooseHints,
  offline,
}: {
  room: RoomView;
  game: GameView;
  log: LoggedEvent[];
  shouts: Shout[];
  /** A refused move, to be shown against the hand it was refused from. */
  refusal: GoletaError | null;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
  onShowRules: () => void;
  /** Whether the table is marking up your playable cards. Live, not a countdown. */
  hints: boolean;
  onChooseHints: (wanted: boolean) => void;
  offline: boolean;
}) {
  const [explainSunny, setExplainSunny] = useState(false);
  /** The invite is open over the table. Anybody's to open, host or not (#135). */
  const [inviting, setInviting] = useState(false);
  /** Whose reach you are part-way through accusing, if any. */
  const [accusing, setAccusing] = useState<string | null>(null);
  const [ackedCall, setAckedCall] = useState<number | null>(null);
  const [graduating, setGraduating] = useState(false);
  const [helpedTurn, setHelpedTurn] = useState<number | null>(null);
  const [stalled, setStalled] = useState(false);
  const [handSort, setHandSort] = useState<HandSort>(loadHandSort);
  /**
   * Which deal this phone has already been turned sideways for, if any.
   *
   * The deal rather than a bare flag: a boolean reset by an effect on the game
   * changing would put the rotate panel back up for a frame at the top of every
   * hand. `gamesPlayed` is constant through a deal, moves at the next one, and
   * survives a reconnect — which the event log, which starts empty on every page
   * load, does not.
   */
  const [rotatedFor, setRotatedFor] = useState<number | null>(null);
  /**
   * The room the upright hand has to spend, measured rather than assumed.
   *
   * The landscape view has always done this and the upright one never did, so
   * upright was the one place left in the app where a hand you could not read
   * without scrolling sideways was still possible — the exact failure #59 set
   * out to abolish, living on in the view that never got the fix (#191).
   *
   * **Width only.** `handHeight` exists because the landscape hand owns the
   * whole column and is entitled to fill it; this column is shared with the
   * seat strip, the piles, the prompt and the log, and the hand is not entitled
   * to grow into any of them. The card stays on the ladder at `FULL_TABLE.hand`
   * and only the *step* is measured.
   */
  const handRow = useRef<HTMLDivElement>(null);
  const handBox = useBox(handRow);
  const phone = useIsPhone();
  const portrait = useIsPortrait();
  const nameOf = namerFor(room);
  const you = game.players.find((player) => player.id === game.you);
  const mine = game.waitingOn === game.you;
  const finished = game.status === "over";
  /**
   * Whether the four edges of the screen are lit (#190).
   *
   * `mine` is `waitingOn`, not whose turn it is, which is what makes this cover
   * naming a suit under the Power of Eights and the card owed after a landed
   * call — two moments the table is waiting on you while somebody else holds
   * the turn. A watcher never has it, because `mine` is already false for them
   * everywhere.
   */
  const glowing = mine && !finished;
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
  // The first two are the same beat wherever a call is watched, so the timing
  // lives in `useJudgedCall` and the table screen (#14) gets it too.
  const { call, id: lastCallId, peeling, announcing, endAnnouncement } = useJudgedCall(log);

  /**
   * A phone at a table where nobody is looking at their phone (#81).
   *
   * The gap between your turns at a table of six is minutes, and a challenge
   * window is over as soon as the next player moves — not something you catch
   * through a lock screen. Never in an online room: somebody playing on their
   * laptop at home has an OS that knows what it is doing.
   */
  useWakeLock(room.irl && seated && !finished);

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
    endAnnouncement();
    explainIfNew();
  }, [endAnnouncement, explainIfNew]);

  const acknowledgeCaught = useCallback(() => {
    setAckedCall(lastCallId ?? null);
    endAnnouncement();
    explainIfNew();
  }, [lastCallId, endAnnouncement, explainIfNew]);

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
   * Whether the table is marking up your playable cards.
   *
   * Three sources, and #187 changed exactly one of them. `hints` is your own
   * standing preference, read live, set from the rules screen or your own cog
   * and changeable at any time — it used to be `finishedGames === 0 &&
   * wantedHints`, a countdown nobody set which expired after one game.
   *
   * The other two are untouched. `sunnyPlay` is the play you owe after a call
   * has landed on you: you have already been caught, the move is forced, and
   * there is nothing left to fumble. And `helpedTurn` is a single turn bought
   * with `want help?`, out loud, in front of everybody.
   *
   * Being caught out having a play you didn't make is the whole subject of the
   * Sunny Rule, and an app that points at the answer never lets anyone be
   * caught — which is why turning this on is public. See `SeatView.hinted`.
   */
  const assist =
    game.phase.kind === "sunnyPlay" || hints || helpedTurn === game.turnNumber;

  /**
   * Telling the room what this browser wants, so the table can see it.
   *
   * The preference is the browser's and the mark is the room's, and this is the
   * one line that keeps them in step: on arrival, on a reconnect, and on every
   * change from either screen that sets it. Only ever sent when the two
   * disagree — the server announces a *change* to on, so a re-assertion is
   * silent, but an unconditional send would be a message on every render.
   *
   * A watcher has no seat and nothing to mark, so nothing is sent for them.
   */
  const seatHinted = room.seats.find((seat) => seat.id === game.you)?.hinted;
  useEffect(() => {
    if (seatHinted === undefined || seatHinted === hints) return;
    send({ t: "setHints", on: hints });
  }, [seatHinted, hints, send]);

  /**
   * One count per game this browser has seen through to the end.
   *
   * Off `room.gamesPlayed` rather than off the `gameOver` event, for the same
   * reason `rotatedFor` is: the server owns that number, every `RoomView`
   * carries it, and it survives a reload, a reconnect and a redeploy — which
   * the event log, which starts empty on every page load, does not. Keyed off
   * the event, the count only moved if this browser happened to be connected,
   * seated and rendering this screen at the instant the event arrived, so a
   * first game that ended while the phone was away was never counted and the
   * training wheels stayed on for the second (#184).
   *
   * The bookmark in `localStorage` is what keeps each game counted once: it is
   * written on the way past whether or not anything is credited, so coming back
   * to a room whose game has already finished credits it exactly once, and
   * arriving at a table three games in credits none of them. A **watcher**
   * moves the bookmark and is credited nothing — they finished no games — so
   * taking a seat afterwards starts from where they sat down.
   *
   * **What the count decides changed in #187.** It used to seed `learning` —
   * the highlights were on until your first game was over and then off for
   * good — so it had to be state, and it had to be corrected in a layout effect
   * before anything was drawn. The highlights are a preference now, read live,
   * so the count decides one thing and decides it once: whether to *ask*, after
   * your first finished game, if you want to keep them. Nothing renders off it,
   * which is why it is no longer held in state.
   *
   * It stays a layout effect anyway. The bookkeeping is about what has already
   * happened by the time this screen exists, and running it before paint is
   * what keeps the question and the frame it is asked over in step.
   */
  const played = room.gamesPlayed;
  useLayoutEffect(() => {
    const credit = gamesToCredit(gamesSeen(room.code), played);
    markGamesSeen(room.code, played);
    if (credit === 0 || game.you === null) return;
    const before = gamesFinished();
    const total = recordGamesFinished(credit);
    // Only worth asking somebody who has the highlights to keep. Nothing is
    // being offered back to a player who never took them.
    if (before === 0 && total > 0 && hints) setGraduating(true);
  }, [room.code, played, game.you, hints]);

  // A while on a turn you haven't moved on, and the app offers a hand. Every
  // fresh draw restarts the clock: you're deciding again.
  const couldUseHelp = mine && game.phase.kind === "action" && !finished && !assist;
  useEffect(() => {
    setStalled(false);
    if (!couldUseHelp) return;
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, [couldUseHelp, game.turnNumber, game.drawsThisTurn]);

  /**
   * The one question the first finished game asks, answered.
   *
   * It offers rather than announces (#187), so both answers are real: keeping
   * the help is a no-op on the preference and giving it up sets it, and neither
   * happens until one of them is pressed.
   */
  const answerGraduation = (keep: boolean): void => {
    setGraduating(false);
    if (!keep) onChooseHints(false);
  };

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

  /** Your own shout, if you have one up — and which of the two it is. */
  const shoutingHere = shouts.findLast((shout) => shout.playerId === game.you) ?? null;

  /**
   * Whose reach is on offer, if anybody's — the one seat a call could be made
   * about right now.
   *
   * `sunnyCallable` is false for a watcher, for the drawer themselves and for
   * anybody eliminated, so this is already only ever a seat that may act on it
   * (`redact.ts`). Null while the picker is open: the picker *is* the call
   * being composed, and an offer to start one over the top of it is an offer to
   * do the thing you are already doing.
   */
  const sunnyTarget = game.sunnyCallable && accusing === null ? game.sunnyTargetId : null;

  /** Your hand, in whatever order you asked for. Both layouts draw this one. */
  const handCards = sortHand(you?.hand ?? [], handSort);

  /**
   * Left edge to left edge for the upright hand — the same three stages, in the
   * same order, with the same numbers as landscape (#191).
   *
   * Whole cards with air between them while there is room; then overlapping,
   * each leaving the one before it a sliver, down to the 44px tap floor; then
   * `fit`, down to 18px, where one tap raises a card and the second commits it
   * (#117); and only past that does anything scroll.
   *
   * Unmeasured is the loosest step, and the loosest step is a whole card plus
   * six pixels — which is exactly the `gap-1.5` this row used to be laid out
   * with, so the frame before the first measurement is the layout it always
   * had rather than a flash of something else.
   *
   * `fit` brings the double-tap confirm with it, and that is right: below the
   * tap floor the target is thinner than a thumb. It stays conditional on the
   * squeeze rather than on the mode — `Hand` checks the step against `TIGHTEST`
   * itself — because a confirm on every card would wreck the rhythm of an
   * ordinary turn.
   */
  const handFanStep = handStep(
    handBox.width,
    handCards.length,
    CARD_WIDTH_PX[FULL_TABLE.hand],
    undefined,
    true,
  );

  /**
   * Somebody else's ask, for the landscape view to carry.
   *
   * Yours goes over your own cards there, same as it does upright. Everybody
   * else's had no seat to rise off and was dropped on the floor, which made an
   * IRL table — where every phone is in that view — the one place a public ask
   * for help was private. The latest one: they last a couple of seconds and two
   * at once in a 40px strip is a queue, not a shout.
   */
  const helpFrom = shouts.findLast((shout) => shout.playerId !== game.you) ?? null;

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

  /**
   * Whether this screen is a phone at a table of people in the same room.
   *
   * All three have to hold, and none of them is a user agent: the room says it
   * is an IRL table, the viewport says this is a phone rather than a tablet
   * propped at one, and there is a game running. The lobby and the screens
   * between games are untouched by any of it, and an online room never sees a
   * word of it.
   *
   * **`!finished` stays in here**, even though a sideways phone at the end of a
   * hand now has a screen of its own (`handOver` below). This flag is what the
   * rotate bookkeeping hangs off, and `room.gamesPlayed` moves at *game over*
   * rather than at the next deal — so a version of it that stayed true past the
   * final event would stamp `rotatedFor` with the number the next deal is going
   * to be asked about, and that deal would never prompt. Asked once per deal is
   * the rule; this is the line that keeps it.
   */
  const irlPhone = room.irl && phone && seated && !finished;

  /**
   * A judged call takes the whole table back, whichever view you were in.
   *
   * The peel rewinds the pile to the moment of the reach with two cards marked
   * and then announces the ruling (#63) — the one moment in this game the whole
   * table is meant to watch happen. It cannot play out in a 40px strip, so the
   * hand view hands over for the length of it, offender's dialog included, and
   * comes back when it is done.
   */
  const judging = peeling || announcing || caughtHold;
  const compact = irlPhone && !portrait && !judging;

  /**
   * The same phone, sideways, once the hand is over (#158).
   *
   * Not `irlPhone` for the reason above, and not `seated` either: a watcher's
   * phone lands on the same upright column, and the offer it is scrolling past
   * — join the next game — is the one thing it is there for.
   *
   * It waits for `judging` exactly as the hand view does. A game can end on the
   * play a landed call forced, so the peel and the ruling may still have the
   * screen; they get it, and this comes up after.
   */
  const handOver = room.irl && phone && !portrait && finished && !judging;

  /**
   * Which way up the phone is *is* the toggle, once it has been turned once.
   *
   * A phone in landscape has already obeyed a prompt it may never have been
   * shown, so it counts from the moment it is seen that way — and it counts
   * against this deal, so the next one asks again. Sitting down to a new hand is
   * when a phone gets picked up, put down or handed over.
   */
  useEffect(() => {
    if (irlPhone && !portrait) setRotatedFor(room.gamesPlayed);
  }, [irlPhone, portrait, room.gamesPlayed]);

  // A landscape layout on a phone held upright shows half of itself, and no web
  // page can turn somebody's phone for them — so the prompt *is* the mechanism
  // (#79). It is asked once a deal: after that, upright means the whole table,
  // which is a view rather than a mistake. Nothing pauses behind it either way —
  // the game is on the server, and a player holding their phone the wrong way is
  // late, not somebody the table waits on.
  if (irlPhone && portrait && rotatedFor !== room.gamesPlayed) {
    return <RotatePanel offline={offline} />;
  }

  if (handOver) {
    return (
      <>
        <HandOver
          room={room}
          game={game}
          nameOf={nameOf}
          seated={seated}
          onDealAgain={() => send({ t: "start" })}
          onJoinNext={() =>
            send({ t: "join", code: room.code, name: loadName() || "Watcher" })
          }
          onLeave={onLeave}
        />

        {/* Both of these are armed by the event that just ended the game, so
            they have to be reachable from the screen that event lands on. The
            graduation especially: it is shown once, after your first finished
            game, and in landscape it had nowhere at all to appear. */}
        {explainSunny ? (
          <SunnyExplainer
            onDone={() => {
              markSunnySeen();
              setExplainSunny(false);
            }}
          />
        ) : null}
        {graduating ? <Graduation onChoose={answerGraduation} /> : null}
      </>
    );
  }

  if (compact) {
    return (
      <TableMotion game={game} log={log} scale={PEEK_TABLE}>
        {/* Both layouts, and deliberately the same thing in both: this is the
            one cue that should not depend on which way the phone is held. */}
        {glowing ? <TurnGlow /> : null}
        <HandView
          room={room}
          game={game}
          nameOf={nameOf}
          send={send}
          offline={offline}
          cards={handCards}
          mode={mode}
          assist={assist}
          onChooseCard={onChooseCard}
          refusal={refusal}
          canDraw={mine && game.phase.kind === "action" && !finished}
          onDraw={() => send({ t: "intent", intent: { type: "drawCard", playerId: me } })}
          mine={mine}
          handSort={handSort}
          onCycleSort={cycleSort}
          stalled={stalled}
          onAskForHelp={askForHelp}
          onShowInvite={() => setInviting(true)}
          onShowRules={onShowRules}
          hints={hints}
          onChooseHints={onChooseHints}
          shouting={shoutingHere?.kind ?? null}
          helpFrom={helpFrom ? { name: nameOf(helpFrom.playerId), kind: helpFrom.kind } : null}
          accusing={accusing}
          stillAccusable={stillAccusable}
          sunnyTarget={sunnyTarget}
          onStartAccusing={startAccusing}
          onStopAccusing={stopAccusing}
          onAccuse={accuse}
        />
        {explainSunny ? (
          <SunnyExplainer
            onDone={() => {
              markSunnySeen();
              setExplainSunny(false);
            }}
          />
        ) : null}

        {/* Over the hand rather than docked into it, unlike the two pickers.
            Nothing here is a decision made by reading your cards against the
            board, so covering them costs nothing — and this is the view an IRL
            table is actually in when somebody walks up (#135). */}
        {inviting ? (
          <RoomInvite
            code={room.code}
            underWay={!finished}
            screens={room.tableScreens}
            onClose={() => setInviting(false)}
          />
        ) : null}
      </TableMotion>
    );
  }

  return (
    <TableMotion game={game} log={log}>
      {glowing ? <TurnGlow /> : null}
      {/* All four, not just the bottom. The top costs nothing in Safari, where
          the browser's own chrome covers the island — and stops costing nothing
          the moment this runs standalone. The sides are for the landscape look
          at the full table, which an online room gets whenever a phone is
          turned. */}
      <div
        className={[
          "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 p-3",
          "pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
        ].join(" ")}
      >
        <header className="flex items-center gap-2 text-xs text-white/50">
          {/* Yours first, the host's second, and the two are legible as
              different things: a person and a gear, an inch apart, one of which
              changes the game for everybody (#188). A watcher gets neither —
              the only thing in this drawer is about your own cards. */}
          {seated ? (
            <PlayerSettingsCog
              hints={hints}
              onHints={onChooseHints}
              className="-ml-2"
            />
          ) : null}
          {/* Beside the player's, not in place of it, because it is the host's way
              back to everything the lobby held and the rest of this line is
              facts about the room rather than things to press. What used to sit
              at the far end was a lone `in person: on` button — the only host
              control that survived the lobby, reading like a status somebody
              had left switched on. It lives behind the cog now, with the rules
              for the next deal beside it (#134). */}
          {room.hostId === game.you ? (
            <HostSettingsCog
              rules={room.houseRules}
              irl={room.irl}
              dealerMode={room.dealerMode}
              onRules={(rules) => send({ t: "setHouseRules", rules })}
              onIrl={(on) => send({ t: "setIrl", on })}
              onDealerMode={(dealer) => send({ t: "setDealerMode", mode: dealer })}
              // Pulled back over the column's own padding only when it leads
              // the row. With the player's cog before it there is nothing to
              // pull back over. The row was already this tall — `rules` and
              // `leave` are `Button`s, and every `Button` is `min-h-11` — so
              // neither target costs the header anything.
              className={seated ? "" : "-ml-2"}
            />
          ) : null}
          {/* The code was four characters saying what the room was called and
              doing nothing, which is the whole of what a code is for when
              there is no lobby left to go back to. Tapping it is the invite —
              a person or a shared screen, same room, different link (#135).
              Anybody may open it: handing somebody the way in is not a host
              power, and nothing behind it changes the room.

              It is a glyph rather than the four characters since #162. The
              panel leads with the code at reading-out size, so during a hand
              the characters were furniture: this says *there is a way in here*
              and the way in says the rest. */}
          <button
            type="button"
            aria-label={`Invite to room ${room.code}`}
            aria-haspopup="dialog"
            title={`Invite to room ${room.code}`}
            onClick={() => setInviting(true)}
            className={[
              "-m-1 flex shrink-0 items-center rounded-lg p-1 text-base text-white/70",
              "transition-colors hover:text-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
            ].join(" ")}
          >
            <QrGlyph />
          </button>
          {offline ? <span className="text-amber-300">· reconnecting…</span> : null}
          {/* No way back to the hand here, and none needed: at an IRL table the
              phone is the toggle. Turning it sideways is the hand view and
              turning it upright is this one — a gesture the table can see you
              make, which two words in a corner never were. */}
          <Button variant="ghost" className="ml-auto px-2 py-1 text-xs" onClick={onShowRules}>
            rules
          </Button>
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onLeave}>
            leave
          </Button>
        </header>

        <Seats room={room} game={game} shouts={shouts} />

        <div className="flex flex-1 flex-col justify-center gap-4 py-2">
          <Piles
            game={game}
            canDraw={mine && game.phase.kind === "action" && !finished}
            onDraw={() => send({ t: "intent", intent: { type: "drawCard", playerId: me } })}
            irl={room.irl}
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

          <TurnPrompt game={game} nameOf={nameOf} assist={assist} />
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
              <>
                <p className="mt-2 text-sm text-white/50">
                  Waiting for {nameOf(room.hostId)} to deal again.
                </p>
                {!seated ? (
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <Button
                      variant="primary"
                      onClick={() =>
                        send({
                          t: "join",
                          code: room.code,
                          name: loadName() || "Watcher",
                        })
                      }
                      disabled={room.seats.length >= room.maxPlayers}
                    >
                      {room.seats.length >= room.maxPlayers ? "Table is full" : "Join next game"}
                    </Button>
                  </div>
                ) : null}
              </>
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
            irl={room.irl}
          />
        ) : null}

        {game.phase.kind === "suit" && mine ? (
          <DockedSuitPicker
            onPick={(suit: Suit) =>
              send({ t: "intent", intent: { type: "chooseSuit", playerId: me, suit } })
            }
          />
        ) : null}

        {/* Everything from here to the log belongs to a seat. A watcher is
            shown the table and nothing that implies they are at it. */}
        {seated ? (
          <div className="relative flex flex-col">
            {/*
              The way into a call, over the felt just above your own cards —
              where your eyes are during somebody else's turn, and which is the
              whole reason it is here rather than back in the seat strip (#189).

              Absolute, so it arrives with some presence without moving the
              cards underneath it, and pinned to the left rather than the middle
              because the middle above this box is where your own `HelpShout`
              rises. It is nowhere near the draw pile, which is up in the
              middle of the table: a fat target beside the deck is a mis-tap
              into the exact violation it accuses.
            */}
            {sunnyTarget ? (
              <div className="pointer-events-none absolute -top-12 left-0 z-20 flex">
                <SunnyCall
                  targetName={nameOf(sunnyTarget)}
                  lockedDraws={game.sunnyLockedDraws}
                  onCall={() => startAccusing(sunnyTarget)}
                  className="pointer-events-auto"
                />
              </div>
            ) : null}

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
            {shoutingHere ? <HelpShout kind={shoutingHere.kind} /> : null}

            {/* The same frame every other seat gets when the table is waiting on
                it. Your own cards aren't in the strip, so the one seat that most
                wants the highlight was the only one without it.

                On a wrapper rather than on `Hand` itself: that element scrolls
                its own overflow, and a box that clips one axis clips both, so it
                would trim its own ring. */}
            <div
              // The box the fan is fitted against. It has no padding of its
              // own and `Hand` keeps none once it is fanning, so the width
              // measured here is the width the cards actually get — an inset
              // here and an inset in the arithmetic are two places to
              // disagree. Its own width comes from the column above rather
              // than from the cards inside it, so measuring it cannot feed
              // back into what it measures.
              ref={handRow}
              className={[
                "relative rounded-2xl transition-colors",
                mine ? "ring-1 ring-amber-300/60" : "",
              ].join(" ")}
            >
              {/* Hung off the top edge of your own cards, keyed so a second
                  refusal in the same words is a second answer rather than a
                  pill that never moved. */}
              {refusal ? <MoveRefusal key={refusal.id} error={refusal} /> : null}
              <Hand
                cards={handCards}
                legalCardIds={game.legalCardIds}
                mode={mode}
                assist={assist}
                onChoose={onChooseCard}
                // Named rather than left to `Hand`'s default, because the step
                // above is fitted against this rung's width and the two have to
                // be the same rung.
                size={FULL_TABLE.hand}
                step={handFanStep}
                fit
                irl={room.irl}
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

        {inviting ? (
          <RoomInvite
            code={room.code}
            underWay={!finished}
            screens={room.tableScreens}
            onClose={() => setInviting(false)}
          />
        ) : null}

        {graduating ? <Graduation onChoose={answerGraduation} /> : null}
      </div>
    </TableMotion>
  );
}
