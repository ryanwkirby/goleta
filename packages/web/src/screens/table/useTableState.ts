import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ClientMessage, GameView, RoomView } from "@goleta/engine";

import { CARD_WIDTH_PX } from "../../lib/cardShape.ts";
import type { GoletaError, LoggedEvent, Shout } from "../../lib/feed.ts";
import { namerFor } from "../../lib/format.ts";
import { creditFinishedGames } from "../../net/graduation.ts";
import { handStep } from "../../lib/handFan.ts";
import { assisting, handMode } from "../../lib/handMode.ts";
import { useJudgedCall } from "../../lib/judgedCall.ts";
import { useBox } from "../../lib/measure.ts";
import { useReshuffle } from "../../lib/reshuffle.ts";
import { NEXT_SORT, sortHand, type HandSort } from "../../lib/sort.ts";
import { caughtState, stillAccusable, sunnyTarget } from "../../lib/sunnyOffer.ts";
import {
  isIrlPhone,
  shuffleEntryId,
  tableRoute,
  type TableSituation,
} from "../../lib/tableRoute.ts";
import { useIsPhone, useIsPortrait } from "../../lib/viewport.ts";
import { useWakeLock } from "../../lib/wakeLock.ts";
import { FULL_TABLE } from "../../motion/plan.ts";
import {
  hasSeenSunny,
  loadHandSort,
  markSunnySeen,
  saveHandSort,
} from "../../net/identity.ts";
import type {
  HandControls,
  HelpControls,
  SunnyControls,
  TableContext,
} from "../../lib/tableProps.ts";

/**
 * How long you can sit on a turn before the app offers you a hand.
 *
 * Seven seconds, not five. Five is inside the length of an ordinary turn at a
 * table where people are talking to each other, so the offer kept turning up on
 * turns nobody was stuck on — and an offer of help you didn't need is the app
 * saying it thinks you do.
 */
const STALL_MS = 7000;

export interface TableStateInput {
  room: RoomView;
  game: GameView;
  log: LoggedEvent[];
  shouts: Shout[];
  /** A refused move, to be shown against the hand it was refused from. */
  refusal: GoletaError | null;
  send: (message: ClientMessage) => void;
  /** Whether the table is marking up your playable cards. Live, not a countdown. */
  hints: boolean;
  onChooseHints: (wanted: boolean) => void;
  offline: boolean;
}

/**
 * Everything the table screen knows, worked out once.
 *
 * `Table.tsx` was a 900-line component that both derived every fact about the
 * table *and* drew two complete layouts, and a fresh agent asked to add one
 * boolean to it reported having to "scan the whole thing to find where derived
 * flags live and where the layouts render" (#226). Those are two jobs, and this
 * is the first of them.
 *
 * What is left in the screen is the answer to *what does the table show* — five
 * possible screens and the markup for one of them. What is in here is the
 * answer to *what is true right now*.
 *
 * The decisions themselves are not here either. `tableRoute`, `handMode`,
 * `sunnyOffer` and `graduation` are pure modules in `lib/` with tests of their
 * own; this holds the state they are computed from and wires them together.
 *
 * **Hook order is the reason this is one function rather than several.** Every
 * `useState` and every effect below runs in the order it is written, before the
 * screen picks which of its five layouts to return — which is what it did
 * before, and what React requires.
 */
export function useTableState({
  room,
  game,
  log,
  shouts,
  refusal,
  send,
  hints,
  onChooseHints,
  offline,
}: TableStateInput) {
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
   * The shuffle this phone has already been shown the new order for (#199).
   *
   * The log entry's id rather than a boolean, so a second shuffled deal puts
   * the list back up and a dismissal cannot be carried over from the last one.
   * The log starts empty on every page load, so a reload mid-hand does not
   * reopen it — which is right: it is a "get up and move" screen, and by then
   * everybody has.
   */
  const [seatedFor, setSeatedFor] = useState<number | null>(null);
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
   * The deck running out, given five seconds to be noticed in (#209).
   *
   * Same shape as the call above and for the same reason: it is a moment the
   * whole table is in, so the timing is a hook read off the log rather than a
   * decision either layout makes. It gates nothing — not the draw pile, not the
   * bots, not a turn — it only decides what the prompt says.
   */
  const { drawPileSize: reshuffling } = useReshuffle(log);

  /**
   * A phone at a table where nobody is looking at their phone (#81).
   *
   * The gap between your turns at a table of six is minutes, and a challenge
   * window is over as soon as the next player moves — not something you catch
   * through a lock screen. Never in an online room: somebody playing on their
   * laptop at home has an OS that knows what it is doing.
   */
  useWakeLock(room.irl && seated && !finished);

  const { caughtYou, caughtHold, showCaught } = caughtState(
    call,
    lastCallId,
    ackedCall,
    peeling,
    game.you,
  );

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
  const accusable = stillAccusable(game, accusing);
  useEffect(() => {
    if (accusing !== null && !accusable) stopAccusing();
  }, [accusing, accusable, stopAccusing]);

  const assist = assisting(game, hints, helpedTurn);

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
    if (creditFinishedGames(room.code, played, game.you !== null, hints)) setGraduating(true);
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

  const offeredTarget = sunnyTarget(game, accusing);

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

  const mode = handMode(game, mine, caughtHold);

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
   * Which of five screens this is, worked out in one place (#225).
   *
   * These were four early returns spread across eighty lines, built out of
   * flags declared thirty lines apart, and between them they decide whether
   * somebody sees their hand, the table, a prompt to turn the phone over, or a
   * list telling them where to go and sit. `lib/tableRoute.ts` has the order
   * and the reasoning, and — for the first time — tests.
   */
  const judging = peeling || announcing || caughtHold;
  const situation: TableSituation = {
    irl: room.irl,
    gamesPlayed: room.gamesPlayed,
    finished,
    seated,
    phone,
    portrait,
    judging,
    shuffleId: shuffleEntryId(log),
    seatedFor,
    rotatedFor,
  };
  const route = tableRoute(situation);
  const irlPhone = isIrlPhone(situation);

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

  /**
   * Whether the deck is tappable, and what happens when it is.
   *
   * Both layouts draw a draw pile and both were spelling this out for
   * themselves. It stays tappable when you hold a legal play, with no warning
   * and no disabled state — drawing when you could have played is the violation
   * the entire Sunny Rule exists to punish, and the UI must permit it silently.
   */
  const canDraw = mine && game.phase.kind === "action" && !finished;
  const drawCard = (): void =>
    send({ t: "intent", intent: { type: "drawCard", playerId: me } });

  /** Written once and passed to whichever screen is up. */
  const sunnyExplained = (): void => {
    markSunnySeen();
    setExplainSunny(false);
  };
  const invitePanel = inviting
    ? {
        code: room.code,
        underWay: !finished,
        screens: room.tableScreens,
        onClose: () => setInviting(false),
      }
    : null;

  /**
   * What the landscape view is handed, in four bundles rather than thirty
   * separate props (#225). `HandView` destructures them on its first line, so
   * the grouping is at the boundary and nowhere else.
   */
  const tableContext: TableContext = { room, game, nameOf, send, offline, reshuffling };
  const handControls: HandControls = {
    cards: handCards,
    mode,
    assist,
    onChooseCard,
    refusal,
    canDraw,
    onDraw: drawCard,
    mine,
    handSort,
    onCycleSort: cycleSort,
  };
  const helpControls: HelpControls = {
    stalled,
    onAskForHelp: askForHelp,
    hints,
    onChooseHints,
    shouting: shoutingHere?.kind ?? null,
    helpFrom: helpFrom ? { name: nameOf(helpFrom.playerId), kind: helpFrom.kind } : null,
  };
  const sunnyControls: SunnyControls = {
    accusing,
    stillAccusable: accusable,
    target: offeredTarget,
    onStartAccusing: startAccusing,
    onStopAccusing: stopAccusing,
    onAccuse: accuse,
  };

  return {
    accusable,
    accuse,
    accusing,
    acknowledgeCaught,
    announcementOver,
    announcing,
    answerGraduation,
    assist,
    call,
    canDraw,
    caughtYou,
    drawCard,
    explainSunny,
    finished,
    glowing,
    graduating,
    handControls,
    handFanStep,
    handRow,
    helpControls,
    invitePanel,
    me,
    mine,
    mode,
    nameOf,
    owesPunishment,
    peeling,
    reshuffling,
    route,
    seated,
    setInviting,
    setSeatedFor,
    showCaught,
    skipped,
    stopAccusing,
    sunnyControls,
    sunnyExplained,
    tableContext,
  };
}
