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
import { useDeparture } from "../../lib/departure.ts";
import { useReshuffle } from "../../lib/reshuffle.ts";
import { NEXT_SORT, sortHand, type HandSort } from "../../lib/sort.ts";
import {
  accusePickerOpen,
  caughtNarration,
  caughtState,
  stillAccusable,
  sunnyTarget,
} from "../../lib/sunnyOffer.ts";
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
 * How long you can sit on a turn before the app offers you a hand. Seven
 * seconds, not five: five is inside the length of an ordinary turn at a table
 * where people are talking, so the offer kept turning up on turns nobody was
 * stuck on.
 */
const STALL_MS = 7000;

export interface TableStateInput {
  room: RoomView;
  game: GameView;
  log: LoggedEvent[];
  shouts: Shout[];
  /** A refused move, shown against the hand it was refused from. */
  refusal: GoletaError | null;
  send: (message: ClientMessage) => void;
  /** Whether the table is marking up your playable cards. Live, not a countdown. */
  hints: boolean;
  onChooseHints: (wanted: boolean) => void;
  offline: boolean;
}

/**
 * Everything the table screen knows, worked out once — `Table.tsx` both derived
 * every fact *and* drew two layouts (#226). The decisions themselves live in
 * `lib/`: `tableRoute`, `handMode`, `sunnyOffer`, `graduation`.
 *
 * **Hook order is why this is one function rather than several.**
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
   * The two below are the same kind of thing and share a hazard: each is *this
   * phone* remembering it has been shown something once this deal, which is not a
   * lifetime and cannot be recovered from when an event landed — somebody may sit
   * looking at `takeYourSeat` for a minute before pressing Done. So neither
   * survives this hook being mounted afresh, and a screen that unmounted the
   * table put both back up in the middle of a hand (#360). Nothing does that any
   * more — the rules are drawn over the table rather than instead of it — and
   * anything added here meaning "already seen" inherits the same requirement.
   */

  /**
   * The deal rather than a bare flag: a boolean reset by an effect would put the
   * rotate panel back up for a frame at the top of every hand.
   */
  const [rotatedFor, setRotatedFor] = useState<number | null>(null);
  /**
   * The shuffle this phone has been shown the new order for (#199). The log
   * entry's id rather than a boolean, so a second shuffled deal puts the list
   * back up. A reload mid-hand does not reopen it, which is right: it is a "get
   * up and move" screen, and by then everybody has.
   */
  const [seatedFor, setSeatedFor] = useState<number | null>(null);
  /**
   * The room the upright hand has to spend (#191). **Width only** — the
   * landscape hand owns its whole column, while this one is shared with the
   * seat strip, the piles, the prompt and the log, so the card stays on the
   * ladder and only the *step* is measured.
   */
  const handRow = useRef<HTMLDivElement>(null);
  const handBox = useBox(handRow);
  /**
   * The felt the piles are sitting in that they are not using (#352). Upright
   * only — landscape draws no log, so neither of these attaches there and the
   * log's floor is what comes out.
   *
   * The piles' block is `flex-1 justify-center`, so it is holding whatever the
   * column has left over; `pilesContent` is what is actually in it. The log is
   * offered the difference, and `lib/logRoom.ts` is why it may only be read
   * while the log is shut.
   */
  const pilesBlock = useRef<HTMLDivElement>(null);
  const pilesContent = useRef<HTMLDivElement>(null);
  const pilesBox = useBox(pilesBlock);
  const pilesInner = useBox(pilesContent);
  const logSlack = pilesBox.height - pilesInner.height;
  const phone = useIsPhone();
  const portrait = useIsPortrait();
  const nameOf = namerFor(room);
  const you = game.players.find((player) => player.id === game.you);
  const mine = game.waitingOn === game.you;
  const finished = game.status === "over";
  /**
   * Whether the four edges of the screen are lit (#190). `mine` is `waitingOn`,
   * which is what makes this cover naming a suit under Power of Eights and the
   * card owed after a landed call.
   */
  const glowing = mine && !finished;
  /**
   * Whether there is a seat behind this screen. A watcher gets the board and
   * none of the furniture that belongs to a seat: no hand frame, no sort
   * control, no offer of help nobody can take, no turn ring that will never
   * light.
   */
  const seated = game.you !== null;

  // A call is evidence before it's news, and news before it's a lesson. The first
  // two are the same beat wherever a call is watched, so the timing is in
  // `useJudgedCall`.
  const { call, id: lastCallId, peeling, announcing, endAnnouncement } = useJudgedCall(log);

  /**
   * The deck running out, given five seconds to be noticed in (#209). Same shape
   * as the call above: a moment the whole table is in, so the timing is a hook
   * rather than a decision either layout makes. It gates nothing.
   */
  const { drawPileSize: reshuffling } = useReshuffle(log);

  /** Somebody leaving, said for a few seconds on the same line and by the same
   * argument (#256). It ranks below the reshuffle and gates nothing. */
  const departed = useDeparture(log);

  /**
   * A phone at a table where nobody is looking at their phone (#81). Never in an
   * online room: somebody on their laptop has an OS that knows what it is doing.
   */
  useWakeLock(room.irl && seated && !finished);

  const { caughtYou, caughtHold, showCaught } = caughtState(
    call,
    lastCallId,
    ackedCall,
    peeling,
    game.you,
  );

  // Taught to players by having it happen to them. A spectator has no call to
  // make and a table screen has nobody to read it, so neither is stopped to be
  // taught the rule, and neither writes the "seen it" flag on the way past.
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
   * Tapping the sun opens the picker rather than calling: an accusation has to
   * name a card, so the tap that starts one can't be the tap that commits it.
   * Opening it also stops the bots, which is what makes three decisions fit in a
   * window paced for one tap.
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
    // server-side, and sending one would only race the intent it follows.
    setAccusing(null);
    send({ t: "intent", intent: { type: "callSunny", playerId: game.you ?? "", cardId } });
  };

  // Somebody else may act, or call it first, while you're still choosing.
  const accusable = stillAccusable(game, accusing);
  // The picker being up, which is also exactly how long this player's log is
  // concealed for (#319). One value, so the two can't disagree.
  const namingCard = accusePickerOpen(game, accusing);
  useEffect(() => {
    if (accusing !== null && !accusable) stopAccusing();
  }, [accusing, accusable, stopAccusing]);

  const assist = assisting(game, hints, helpedTurn);

  /**
   * The preference is the browser's and the mark is the room's, and this is the
   * line that keeps them in step — on arrival, on reconnect, and on every change
   * from either screen. Only sent when the two disagree: an unconditional send
   * would be a message on every render.
   */
  const seatHinted = room.seats.find((seat) => seat.id === game.you)?.hinted;
  useEffect(() => {
    if (seatHinted === undefined || seatHinted === hints) return;
    send({ t: "setHints", on: hints });
  }, [seatHinted, hints, send]);

  /**
   * One count per game this browser has seen through to the end, off
   * `room.gamesPlayed` rather than the `gameOver` event — which the log, empty
   * on every page load, could not survive (#184). The bookmark is written
   * whether or not anything is credited, so arriving three games in credits
   * none of them.
   *
   * Since #187 the count decides one thing: whether to *ask* about keeping the
   * highlights. A layout effect, so the question and the frame are in step.
   */
  const played = room.gamesPlayed;
  useLayoutEffect(() => {
    if (creditFinishedGames(room.code, played, game.you !== null, hints)) setGraduating(true);
  }, [room.code, played, game.you, hints]);

  // Every fresh draw restarts the clock: you're deciding again.
  const couldUseHelp = mine && game.phase.kind === "action" && !finished && !assist;
  useEffect(() => {
    setStalled(false);
    if (!couldUseHelp) return;
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, [couldUseHelp, game.turnNumber, game.drawsThisTurn]);

  /** It offers rather than announces (#187), so both answers are real and neither
   * happens until one of them is pressed. */
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
   * Left edge to left edge for the upright hand — the same three stages and the
   * same numbers as landscape (#191), down through the tap floor to `fit`
   * (#117), and only past that does anything scroll. Unmeasured is the loosest
   * step, which is the `gap-1.5` this row used to be laid out with.
   */
  const handFanStep = handStep(
    handBox.width,
    handCards.length,
    CARD_WIDTH_PX[FULL_TABLE.hand],
    undefined,
    true,
  );

  /**
   * Somebody else's ask, for the landscape view to carry. It had no seat to rise
   * off there, which made an IRL table the one place a public ask was private.
   * The latest one only: two at once in a 40px strip is a queue.
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

  // What the dialog names: the play they were dodging, still in hand because the
  // rewind left it there, and the card the rewind took back off them.
  const legal = new Set(game.legalCardIds);
  const skipped = you?.hand.filter((card) => legal.has(card.id)) ?? [];
  const owesPunishment = (you?.hand.length ?? 0) > 1;
  // Which offence it was and what step three actually does — read off the ruling
  // and the board rather than inferred in the dialog, which is how it came to
  // describe the wrong offence and promise a card that never came (#363).
  const narration = call ? caughtNarration(call, game, owesPunishment) : null;

  /** Which of five screens this is, worked out in one place (#225). These were
   * four early returns spread across eighty lines; `lib/tableRoute.ts` has the
   * order, the reasoning and the tests. */
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
   * Which way up the phone is *is* the toggle, once it has been turned once. A
   * phone already in landscape has obeyed a prompt it may never have been shown,
   * so it counts from the moment it is seen that way — and against this deal, so
   * the next one asks again.
   */
  useEffect(() => {
    if (irlPhone && !portrait) setRotatedFor(room.gamesPlayed);
  }, [irlPhone, portrait, room.gamesPlayed]);

  /**
   * Whether the deck is tappable, and what happens when it is. It stays tappable
   * when you hold a legal play, with no warning and no disabled state — drawing
   * when you could have played is the violation the Sunny Rule exists to punish.
   */
  const canDraw = mine && game.phase.kind === "action" && !finished;
  const drawCard = (): void =>
    send({ t: "intent", intent: { type: "drawCard", playerId: me } });

  /**
   * The turn no longer ends itself (#260), so somebody has to say so. Offered on
   * `game.canEndTurn` and nothing else — that flag is the engine's one condition
   * and it says nothing about your hand, so this button is the same button
   * whether the third draw left you stuck or handed you a play.
   */
  const endTurn = (): void =>
    send({ t: "intent", intent: { type: "endTurn", playerId: me } });

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

  /** Four bundles rather than thirty separate props (#225). `HandView`
   * destructures them on its first line, so the grouping is at the boundary. */
  const tableContext: TableContext = {
    room,
    game,
    nameOf,
    send,
    offline,
    reshuffling,
    departed,
  };
  const handControls: HandControls = {
    cards: handCards,
    mode,
    assist,
    onChooseCard,
    refusal,
    canDraw,
    onDraw: drawCard,
    canEndTurn: game.canEndTurn && !finished,
    onEndTurn: endTurn,
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
    logSlack,
    me,
    mine,
    mode,
    nameOf,
    namingCard,
    narration,
    owesPunishment,
    peeling,
    pilesBlock,
    pilesContent,
    departed,
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
