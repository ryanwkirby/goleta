import type { GameView, RoomView } from "@goleta/engine";

import type { NameOf } from "../lib/format.ts";
import { useFullscreen } from "../lib/fullscreen.ts";
import { pileSuit } from "../lib/pile.ts";
import type { HandSort } from "../lib/sort.ts";
import { DECK, PILE } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import { CardBack, PlayingCard, SuitMark } from "./Card.tsx";
import { HandSortButton } from "./Hand.tsx";
import { HelpAsk, HelpLink } from "./Help.tsx";
import { QrGlyph } from "./QrCode.tsx";
import { SunnySign } from "./Sunny.tsx";

/**
 * The middle of the table, as much of it as a phone in landscape can spare —
 * and, since #131, the whole of this view's furniture as well.
 *
 * **What it carries of the table is the centre and nothing more:** the room
 * code, the draw pile and its count, the card in play with the suit over it when
 * an 8 is live — named, or asked for and not yet given — what the table is
 * waiting for, the sun when a call is on offer, and somebody asking for help.
 * That is the whole list, and the omission that matters is the hands — nobody
 * else's cards appear here at any size.
 *
 * The rest is not table facts, and it is here because the alternative was a row
 * of it under the cards. Your hand is the point of this screen, `handSize` reads
 * the room the row is left, and a line of small print at the foot was a card
 * size the cards never got: the offer of the rest of the screen, the sort
 * control, the offer of a hand when you have sat on a turn, and the draws left
 * on a missed call. None of them is worth a rung.
 *
 * The offer of the screen has a second reason to be here: it has to be reachable
 * from the orientation it is about — `RotatePanel` is shown only to a phone held
 * upright, and a phone already sideways when the cards come out is deliberately
 * never prompted at all (#125).
 *
 * What the table is waiting for is said in full rather than as whose turn it is:
 * the prompt is a superset — it numbers the steps of a landed call and says who
 * is naming a suit — so the strip says the more useful of the two and the footer
 * that used to say it is gone.
 *
 * The ask is on the list because taking help is meant to be public, and at an
 * IRL table every phone is in this view: the upright table draws the shout over
 * the asker's seat, and with no seats here it had nowhere to land and was simply
 * dropped. It says who asked and nothing else. Nobody's cards are involved, so
 * none of what follows is bent by carrying it.
 *
 * It can be this thin because the accusation picker already carries the
 * evidence. `sunnyReach` sends the offender's hand and the board as it stood
 * before the reach to anyone who could call, so the flow survives whole: you
 * see the draw land here, you tap the sun, you read their hand in the picker,
 * you name a card or you back out. Seeing every hand at all times is not what a
 * *call* needs — it is what *noticing* a reach is easier with, and the toggle
 * to the full table is the answer to that.
 *
 * Nothing in here says anything about legality. Not the wording, not the
 * ordering, not a badge, and not the sun, which means what it means everywhere
 * else: somebody reached, and you may accuse them.
 */
export function PeekStrip({
  room,
  game,
  nameOf,
  canDraw,
  onDraw,
  onCallSunny,
  offline,
  helpFrom,
  prompt,
  mine,
  sortable,
  handSort,
  onCycleSort,
  stalled,
  onAskForHelp,
  onShowInvite,
}: {
  room: RoomView;
  game: GameView;
  nameOf: NameOf;
  canDraw: boolean;
  onDraw: () => void;
  onCallSunny: (playerId: string) => void;
  offline: boolean;
  /** Somebody else asking for a hand, by name. Your own goes over your cards. */
  helpFrom: string | null;
  /** What the table is waiting for, in the words the full table uses. */
  prompt: string;
  /** Whether it is waiting for you — the prompt is drawn up when it is. */
  mine: boolean;
  /** Nothing to arrange with one card left, so nothing is offered. */
  sortable: boolean;
  handSort: HandSort;
  onCycleSort: () => void;
  /** A few seconds into a turn you haven't moved on. */
  stalled: boolean;
  onAskForHelp: () => void;
  /** Tapping the room code: the invite, opened by whoever is holding the phone. */
  onShowInvite: () => void;
}) {
  const { anchor, pileFace } = useMotion();
  const fullscreen = useFullscreen();
  const face = pileFace(game.topCard);
  // The same question the full table's pile asks, answered in the same place: a
  // suit named for the card that is actually up, or one owed and not yet given.
  // Null only while a flight is still landing — see `pileSuit`.
  const suit = pileSuit(game, face);
  const target = game.sunnyCallable ? game.sunnyTargetId : null;

  // The side insets are the landscape ones, and they are why this strip has
  // ends worth protecting: the room code sits at the left end and the prompt
  // and the sun are pushed to the right by `ml-auto`, so on a phone with an
  // island one or the other is behind hardware, and which one depends on which
  // way the phone was turned. The border still runs the full width — the felt
  // and its edge bleed, the content insets.
  return (
    <header
      className={[
        // One line, and the give is inside the small print at the left rather
        // than here. A row that wraps has to wrap *something*, and what it picks
        // is whatever no longer fits — the draw pile, which is the one thing on
        // this strip that has to be reachable, and which would take a card's
        // height off the hand on the way down. Wrapping the cluster instead
        // costs nothing at all: two lines of it are shorter than the pile card
        // beside them.
        "flex shrink-0 items-center gap-3 border-b border-white/10 py-1",
        "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
      ].join(" ")}
    >
      {/*
        Your own end of the strip, and it is this end deliberately: the right is
        the draw reach (#117), and a control beside it is a control under a thumb
        aimed at something else. The sort and the offer of help are here because
        the alternative was a row of them under the cards, which cost the hand a
        card size (#131).

        All of it is small print, so it wraps within itself before the strip
        does. Two lines of it are still shorter than the pile card beside them,
        which means the crowded hand — a missed call, an offer of help, a shout
        and a dead socket at once — costs the cards nothing at all.

        The offer of the screen is here rather than on `RotatePanel` because the
        panel is only ever shown to a phone held *upright*, and a phone already
        sideways when the cards come out is never prompted — so the one offer of
        screen space in the app was unreachable from the orientation it was
        about. Absent, not disabled, where the API doesn't exist, and it takes
        itself away once fullscreen is held and comes back if the browser drops
        it.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
        {/* Tappable here for the same reason as upright, and this is the one
            that matters: an IRL table is every phone in this view, so the way
            in that somebody actually holds out to a newcomer is this one
            (#135). Four characters became one glyph in #162 — the code is the
            first thing on the panel behind it, at reading-out size, so what
            went is the width and not the code. */}
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

        {sortable ? (
          <HandSortButton sort={handSort} onCycle={onCycleSort} className="shrink-0" />
        ) : null}

        {stalled ? <HelpLink onAsk={onAskForHelp} /> : null}

        {/* Yours alone: the server sends this to nobody else, and a missed call
            is not something the table needs announcing. */}
        {game.sunnyLockedDraws > 0 ? (
          <span className="shrink-0 text-xs text-white/35" aria-live="polite">
            <span aria-hidden>☀️</span> call missed — {game.sunnyLockedDraws} more{" "}
            {game.sunnyLockedDraws === 1 ? "draw" : "draws"}
          </span>
        ) : null}
      </div>

      {/* The card in play, at the same size, so the two piles read as the pair
          they are on the full table. */}
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
        {/* The suit over the card in play: the one somebody named, or the mark
            for one they have been asked for and not given. Same pill either way,
            in the same place, so an answer arriving changes the glyph rather
            than adding something to the strip (#150). */}
        {suit ? (
          <span className="rounded-full bg-white/10 px-1.5 py-0.5">
            <SuitMark mark={suit} className="text-sm" />
          </span>
        ) : null}
      </div>

      {/* Before the turn indicator rather than after it: the sun keeps the end
          of the strip, and a shout is the one thing here that isn't a standing
          fact — it arrives, it is read, it goes. */}
      {helpFrom ? <HelpAsk name={helpFrom} className="ml-auto text-xs" /> : null}

      <span
        className={[
          helpFrom ? "" : "ml-auto",
          "min-w-0 truncate text-xs",
          mine ? "font-semibold text-amber-300" : "text-white/60",
        ].join(" ")}
        aria-live="polite"
      >
        {prompt}
      </span>

      {/* Not a game fact, and the one thing here that isn't: a player blocked on
          a dead socket needs to know that's what it is. */}
      {offline ? <span className="shrink-0 text-xs text-amber-300">reconnecting…</span> : null}

      {target ? (
        <SunnySign
          targetName={nameOf(target)}
          lockedDraws={game.sunnyLockedDraws}
          onCall={() => onCallSunny(target)}
          className="shrink-0"
        />
      ) : null}

      {/*
        Tappable whenever it's your turn, including when you're holding a card
        you could play. Drawing then breaks the rules, and letting you do it
        without a word of warning is the entire point of the Sunny Rule. No
        disabled state, no confirmation — see AGENTS.md. In IRL landscape it
        belongs on the right edge, where a right-handed reach covers least.
      */}
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
