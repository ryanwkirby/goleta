import type { ClientMessage, GameView, RoomView, ShoutKind } from "@goleta/engine";

import { useFullscreen } from "../lib/fullscreen.ts";
import { pileSuit } from "../lib/pile.ts";
import { DECK, PILE } from "../lib/anchors.ts";
import { useMotion } from "../lib/motion.ts";
import { AutopilotReturn } from "./Autopilot.tsx";
import { CardBack, PlayingCard, SuitMark } from "./Card.tsx";
import { HelpAsk } from "./Help.tsx";
import { QrGlyph } from "./QrCode.tsx";
import { SettingsCog } from "./Settings.tsx";
import { SunnyCall } from "./sunny/SunnyCall.tsx";

/**
 * The middle of the table, as much of it as a phone in landscape can spare — and,
 * since #131, the whole of this view's furniture as well.
 *
 * **Of the table it carries the centre and nothing more.** No hands, at any
 * size: `sunnyReach` already feeds the picker the evidence a call is made from —
 * the offender's hand as it stood at the reach — and turning the phone upright
 * is the answer to *noticing* a reach. The board that hand is judged against
 * rode the wire beside it and was drawn for one release (#220, #310); #318 took
 * it back off, so what is missing from the middle of this flow is deliberate and
 * is the caller's to remember. The sun left the strip in #189 — it was drawn
 * immediately before the draw pile, and a fat target beside the deck is a
 * mis-tap into the violation it accuses.
 *
 * Everything else here is not a table fact, and is here because the alternative
 * was a row under the cards, which costs a card size (#131).
 *
 * **The sun is back on this strip, in the cluster** (#329) — which is not #189
 * being undone. #189's objection was the *place*: it was drawn immediately
 * before the draw pile at the right-hand end, and a fat target beside the deck
 * is a mis-tap into the violation it accuses. The cluster is the far end of the
 * row from the deck, and it is the only part of the row allowed to take width.
 * It is drawn `inline` here so it reads as one line of small print beside the
 * fullscreen offer rather than as a stack that could push the pile onto a
 * second row.
 *
 * Nothing in here says anything about legality.
 */
export function PeekStrip({
  room,
  game,
  canDraw,
  onDraw,
  offline,
  helpFrom,
  prompt,
  loud,
  onShowInvite,
  onShowRules,
  hints,
  onChooseHints,
  seated,
  send,
  sunnyTargetName,
  onStartAccusing,
}: {
  room: RoomView;
  game: GameView;
  canDraw: boolean;
  onDraw: () => void;
  offline: boolean;
  /** Somebody else's shout, by name. Your own goes over your cards. */
  helpFrom: { name: string; kind: ShoutKind } | null;
  prompt: string;
  /** It was `mine` until #209, and the rename is the point: two different things
   * want this line read — the table waiting on *you*, and the deck running out,
   * which is nobody's turn. */
  loud: boolean;
  onShowInvite: () => void;
  onShowRules: () => void;
  /** Your own settings (#188). A watcher has no cards, so no cog. */
  hints: boolean;
  onChooseHints: (on: boolean) => void;
  seated: boolean;
  send: (message: ClientMessage) => void;
  /** Who a call would be against, or null when no window is open (#329). */
  sunnyTargetName: string | null;
  onStartAccusing: () => void;
}) {
  const { anchor, pileFace } = useMotion();
  const fullscreen = useFullscreen();
  const face = pileFace(game.topCard);
  // Null only while a flight is still landing — see `pileSuit`.
  const suit = pileSuit(game, face);

  // The side insets are why this strip has ends worth protecting: the small print
  // is at the left and the prompt and draw pile are pushed right, so on a phone
  // with an island one or the other is behind hardware. The border still runs the
  // full width — the felt bleeds, the content insets.
  return (
    <header
      className={[
        // One line, and it never wraps. The cluster below says why.
        "flex shrink-0 items-center gap-3 border-b border-white/10 py-1",
        "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
      ].join(" ")}
    >
      {/*
        ANYTHING NEW ON THIS STRIP GOES IN THIS CLUSTER.

        The strip is one line and must stay one line: a row that wraps wraps
        whatever no longer fits, and at the right-hand end that is the draw pile
        — a card's height pushed onto a second row, straight off the hand.

        This cluster is the release valve, being all small print, so it wraps
        *within itself*. It is also the correct end on its own merits: the right
        is the draw reach (#117).
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
        {/* One cog, the same one the upright header draws, with a *yours* section
          inside it and the host's below that (#253). A watcher gets none. */}
        {seated ? (
          <SettingsCog
            isHost={room.hostId === game.you}
            personal={{
              hints,
              onHints: onChooseHints,
              autopilot: room.seats.find((seat) => seat.id === game.you)?.autopilot ?? "off",
              onAutopilot: (mode) => send({ t: "setAutopilot", mode }),
            }}
            rules={room.houseRules}
            irl={room.irl}
            dealerMode={room.dealerMode}
            shuffleSeats={room.shuffleSeats}
            onRules={(rules) => send({ t: "setHouseRules", rules })}
            onIrl={(on) => send({ t: "setIrl", on })}
            onDealerMode={(mode) => send({ t: "setDealerMode", mode })}
            onShuffleSeats={(on) => send({ t: "setShuffleSeats", on })}
            // 44px of target painted out of 36px of row: a full-height line would spend
            // the cluster's slack, and it spends it out of the hand.
            className="-my-1"
          />
        ) : null}

        {/* The way into a call, at the far end of the row from the deck (#329),
            and **straight after the cog rather than at the end of the cluster**.
            The cluster wraps within itself, and these two are the only things in
            it with a 44px floor — next to each other they share the wrapped
            line, so a narrow phone with a window open grows the strip by 6px
            instead of 18. Measured both ways: the sun last costs the hand a whole
            band at 220px of cluster, and next to the cog costs it almost nothing.

            One line of small print, `inline`, like the fullscreen offer below.
            Tapping it opens the picker and does not call — it sends
            `composingCall`, which holds the bots (#73). */}
        {sunnyTargetName !== null ? (
          <SunnyCall
            targetName={sunnyTargetName}
            lockedReaches={game.sunnyLockedReaches}
            onCall={onStartAccusing}
            inline
            // 44px of target painted out of the cluster's own line, exactly as the
            // cog above it is: a full-height control here spends the strip's
            // height, and the strip spends it out of the hand.
            className="-my-1"
          />
        ) : null}

        {/* The way off the autopilot, for somebody who has just walked back to the
            table (#368). One line of small print in the cluster — the only part
            of this row a control may take width from — and after the two 44px
            items rather than between them, which would split the pair that
            deliberately share a wrapped line above. It draws nothing at all
            unless this seat is on autopilot, so on almost every turn of almost
            every game the row is exactly as it was. */}
        <AutopilotReturn
          mode={room.seats.find((seat) => seat.id === game.you)?.autopilot ?? "off"}
          onEnd={() => send({ t: "setAutopilot", mode: "off" })}
        />

        {/* An IRL table is every phone in this view, so the way in somebody actually
            holds out to a newcomer is this one (#135). Four characters became one
            glyph in #162 — the code leads the panel behind it. */}
        <button
          type="button"
          aria-label={`Invite to room ${room.code}`}
          aria-haspopup="dialog"
          title={`Invite to room ${room.code}`}
          onClick={onShowInvite}
          className={[
            "-m-0.5 flex shrink-0 items-center rounded p-0.5 text-sm text-white/50",
            "transition-colors hover:text-white/80",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
          ].join(" ")}
        >
          <QrGlyph />
        </button>

        {/* Without the first-run hints question: that belongs to the first time
            through, not a mid-hand look-up. Nothing pauses behind it. */}
        <button
          type="button"
          onClick={onShowRules}
          className={[
            "flex shrink-0 items-center rounded-md px-1.5 py-1 text-xs text-white/40",
            "transition-colors hover:text-white/70",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
          ].join(" ")}
        >
          rules
        </button>

        {fullscreen.offer ? (
          <button
            type="button"
            onClick={fullscreen.request}
            className={[
              "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-white/40",
              "transition-colors hover:text-white/70",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
            ].join(" ")}
          >
            <span aria-hidden>⤢</span> full screen
          </button>
        ) : null}

        {/* Yours alone: the server sends this to nobody else. */}
        {game.sunnyLockedReaches > 0 ? (
          <span className="shrink-0 text-xs text-white/35" aria-live="polite">
            <span aria-hidden>☀️</span> call missed — {game.sunnyLockedReaches} more{" "}
            {game.sunnyLockedReaches === 1 ? "reach" : "reaches"}
          </span>
        ) : null}
      </div>

      {}
      <div className="flex items-center gap-1.5">
        {face ? (
          <PlayingCard card={face} size="sm" anchor={anchor(PILE)} mirrored={room.irl} />
        ) : (
          <div
            ref={anchor(PILE)}
            aria-hidden
            className="h-14 w-10 rounded-md border border-dashed border-white/15"
          />
        )}
        {/* Same pill whether a suit was named or is merely owed, so an answer
            arriving changes the glyph rather than adding something (#150). */}
        {suit ? (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5">
            <SuitMark mark={suit} className="text-sm" />
          </span>
        ) : null}
      </div>

      {/* Before the prompt, which takes the slack: whoever is asking for help is
        a person waiting on an answer, and the prompt is the thing that truncates. */}
      {helpFrom ? (
        <HelpAsk name={helpFrom.name} kind={helpFrom.kind} className="ml-auto text-xs" />
      ) : null}

      <span
        className={[
          helpFrom ? "" : "ml-auto",
          "min-w-0 truncate text-xs",
          loud ? "font-semibold text-amber-300" : "text-white/60",
        ].join(" ")}
        aria-live="polite"
      >
        {prompt}
      </span>

      {/* A player blocked on a dead socket needs to know that's what it is. */}
      {offline ? <span className="shrink-0 text-xs text-amber-300">reconnecting…</span> : null}

      {/* Tappable whenever it's your turn, including when you hold a card you could
        play — no disabled state and no warning, see AGENTS.md. */}
      <button
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        aria-label={`Draw a card — ${game.drawPileSize} left`}
        className={[
          "relative flex shrink-0 items-center gap-1.5 rounded-lg transition-transform",
          canDraw
            ? "cursor-pointer hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
            : "cursor-not-allowed opacity-60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300",
        ].join(" ")}
      >
        <CardBack size="sm" anchor={anchor(DECK)} />
        <span aria-hidden className="font-mono text-xs tabular-nums text-white/60">
          {game.drawPileSize}
        </span>
      </button>
    </header>
  );
}
