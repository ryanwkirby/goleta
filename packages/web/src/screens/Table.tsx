import type { ClientMessage, GameView, PlayerId, RoomView, Suit } from "@goleta/engine";

import { EndTurnButton } from "../components/EndTurn.tsx";
import { EventLog } from "../components/EventLog.tsx";
import { Piles } from "../components/Piles.tsx";
import { RotatePanel } from "../components/RotatePanel.tsx";
import { Seats } from "../components/Seats.tsx";
import { SunnyAccusePicker } from "../components/sunny/SunnyAccusePicker.tsx";
import { SuitPicker } from "../components/sunny/SuitPicker.tsx";
import { TakeYourSeat } from "../components/TakeYourSeat.tsx";
import { TurnGlow } from "../components/TurnGlow.tsx";
import type { GoletaError, LoggedEvent, Shout } from "../lib/feed.ts";
import { turnPrompt, type NameOf } from "../lib/format.ts";
import { useMotion } from "../lib/motion.ts";
import { PEEK_TABLE } from "../motion/plan.ts";
import { TableMotion } from "../motion/TableMotion.tsx";
import { loadName } from "../net/identity.ts";
import { HandOver } from "./HandOver.tsx";
import { HandView } from "./HandView.tsx";
import { GameOverPanel } from "./table/GameOverPanel.tsx";
import { OwnHand } from "./table/OwnHand.tsx";
import { TableHeader } from "./table/TableHeader.tsx";
import { TableOverlays } from "./table/TableOverlays.tsx";
import { useTableState } from "./table/useTableState.ts";

/**
 * The line that says what the table is waiting for, and the picker it asks for.
 * Components rather than inline JSX because both read the motion layer — the
 * suit ask waits for the deal (#75) — and `Table` renders `TableMotion` rather
 * than sitting underneath it.
 */
function TurnPrompt({
  game,
  nameOf,
  assist,
  reshuffling,
  departed,
}: {
  game: GameView;
  nameOf: NameOf;
  assist: boolean;
  /** Cards to draw, while the deck running out is being watched (#209). */
  reshuffling: number | null;
  departed: PlayerId | null;
}) {
  const { dealing } = useMotion();
  const mine = game.waitingOn === game.you;
  return (
    <p
      className={[
        "text-center text-sm",
        // The reshuffle line takes the emphasis whoever the table is waiting on: for
        // those five seconds it is the more important of the two.
        reshuffling !== null || departed !== null || (mine && game.status !== "over")
          ? "font-semibold text-amber-300"
          : "text-white/60",
      ].join(" ")}
      aria-live="polite"
    >
      {turnPrompt(game, nameOf, assist, dealing, reshuffling, departed)}
    </p>
  );
}

/**
 * The suit picker, held back until the cards are down. Under Dealer's Choice the
 * game opens in `phase: "suit"`, so without this it asked for a suit for an 8
 * that had not landed (#75). Reduced motion plans no flights, so `dealing` is
 * never true there and nothing is waited for.
 */
function DockedSuitPicker({ onPick }: { onPick: (suit: Suit) => void }) {
  const { dealing } = useMotion();
  if (dealing) return null;
  return <SuitPicker onPick={onPick} />;
}

/**
 * The table, in whichever of five forms this screen is currently owed.
 *
 * **It decides nothing.** `useTableState` works out what is true and
 * `lib/tableRoute` decides which screen that adds up to. What is left here is
 * the answer to *what does the table show*, which is the question this file
 * should be opened to answer (#226).
 */
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
  /** A refused move, shown against the hand it was refused from. */
  refusal: GoletaError | null;
  send: (message: ClientMessage) => void;
  onLeave: () => void;
  onShowRules: () => void;
  /** Whether the table is marking up your playable cards. Live, not a countdown. */
  hints: boolean;
  onChooseHints: (wanted: boolean) => void;
  offline: boolean;
}) {
  const {
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
  } = useTableState({
    room,
    game,
    log,
    shouts,
    refusal,
    send,
    hints,
    onChooseHints,
    offline,
  });

  if (route.kind === "takeYourSeat") {
    const { shuffleId } = route;
    return <TakeYourSeat room={room} you={game.you} onDone={() => setSeatedFor(shuffleId)} />;
  }

  if (route.kind === "rotate") return <RotatePanel offline={offline} />;

  if (route.kind === "handOver") {
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

        {/* Both are armed by the event that just ended the game, so they have to
            be reachable from the screen that event lands on. The graduation
            especially: in landscape it had nowhere at all to appear. */}
        <TableOverlays
          nameOf={nameOf}
          explaining={explainSunny}
          onExplained={sunnyExplained}
          graduating={graduating}
          onGraduate={answerGraduation}
        />
      </>
    );
  }

  if (route.kind === "compact") {
    return (
      <TableMotion game={game} log={log} scale={PEEK_TABLE} mirrored={room.irl}>
        {/* Deliberately the same thing in both layouts: this is the one cue that
            should not depend on which way the phone is held. */}
        {glowing ? <TurnGlow /> : null}
        <HandView
          table={tableContext}
          hand={handControls}
          help={helpControls}
          sunny={sunnyControls}
          onShowInvite={() => setInviting(true)}
          onShowRules={onShowRules}
        />
        <TableOverlays
          nameOf={nameOf}
          explaining={explainSunny}
          onExplained={sunnyExplained}
          invite={invitePanel}
        />
      </TableMotion>
    );
  }

  return (
    <TableMotion game={game} log={log} mirrored={room.irl}>
      {glowing ? <TurnGlow /> : null}
      {/* All four, not just the bottom. The top costs nothing in Safari, where the
          browser's chrome covers the island — and stops costing nothing the
          moment this runs standalone. */}
      <div
        className={[
          "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 p-3",
          "pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
        ].join(" ")}
      >
        <TableHeader
          room={room}
          me={game.you}
          isHost={room.hostId === game.you}
          seated={seated}
          hints={hints}
          onChooseHints={onChooseHints}
          offline={offline}
          send={send}
          onShowInvite={() => setInviting(true)}
          onShowRules={onShowRules}
          onLeave={onLeave}
          // The sun lives up here now rather than over the cards (#329). The
          // window opens on every draw, so what it buys is a control that is
          // always in the same place whichever way up the phone is held.
          sunnyTargetName={sunnyControls.target ? nameOf(sunnyControls.target) : null}
          lockedReaches={game.sunnyLockedReaches}
          onStartAccusing={() => {
            if (sunnyControls.target) sunnyControls.onStartAccusing(sunnyControls.target);
          }}
        />

        <Seats room={room} game={game} shouts={shouts} />

        {/* Two boxes rather than one, so the log can be told how much of this
            the piles are not using (#352). The outer one is what the column
            has left over; the inner one is what is actually in it. */}
        <div ref={pilesBlock} className="flex flex-1 flex-col justify-center py-2">
          <div ref={pilesContent} className="flex flex-col gap-4">
            <Piles
              game={game}
              canDraw={canDraw}
              onDraw={drawCard}
              irl={room.irl}
              // The deck is the only one of the two you touch, and upright it was
              // under the hand holding the phone rather than the one tapping. The
              // landscape strip already puts it at the right-hand end, so this
              // makes the two phone layouts agree (#259).
              deckSide="right"
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

            <TurnPrompt
              game={game}
              nameOf={nameOf}
              assist={assist}
              reshuffling={reshuffling}
              departed={departed}
            />

            {/* Under the prompt, which is the line already saying what the table is
                waiting for — and this is the one moment it is waiting for something
                with a button attached (#260). Nowhere near the draw pile, which is
                the row above, and never under the cards. */}
            {handControls.canEndTurn ? (
              <div className="flex justify-center">
                <EndTurnButton onEndTurn={handControls.onEndTurn} />
              </div>
            ) : null}
          </div>
        </div>

        {finished ? (
          <GameOverPanel
            room={room}
            game={game}
            nameOf={nameOf}
            isHost={room.hostId === game.you}
            seated={seated}
            onDealAgain={() => send({ t: "start" })}
            onJoinNext={() => send({ t: "join", code: room.code, name: loadName() || "Watcher" })}
          />
        ) : null}

        {mode === "surrender" ? (
          <p className="rounded-xl bg-rose-500/15 px-3 py-2 text-center text-sm text-rose-200 ring-1 ring-rose-400/30">
            Choose any card to give up — it doesn't have to match. Tap it twice.
          </p>
        ) : null}

        {/* Both pickers dock above your hand rather than being thrown over the
            table: each is a decision you make by reading what everyone else is
            holding, and a scrim would take the evidence away. */}
        {accusing !== null && namingCard && game.sunnyReach ? (
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
          <OwnHand
            game={game}
            hand={handControls}
            help={helpControls}
            irl={room.irl}
            step={handFanStep}
            boxRef={handRow}
          />
        ) : null}

        {/* Concealed while this player is naming a card, and only for them: the
            log is every play in the game in words, which is the board a call is
            judged against written out at the one moment they are being asked to
            remember it (#319). It keeps its space and says so. */}
        <EventLog log={log} nameOf={nameOf} concealed={namingCard} slack={logSlack} />

        <TableOverlays
          nameOf={nameOf}
          explaining={explainSunny}
          onExplained={sunnyExplained}
          graduating={graduating}
          onGraduate={answerGraduation}
          invite={invitePanel}
          announce={announcing && call && !caughtYou ? { call, onDone: announcementOver } : null}
          caught={
            showCaught && call
              ? { call, skipped, owesPunishment, onDone: acknowledgeCaught }
              : null
          }
        />
      </div>
    </TableMotion>
  );
}
