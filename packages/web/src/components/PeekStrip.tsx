import type { ClientMessage, GameView, RoomView, ShoutKind } from "@goleta/engine";

import { useFullscreen } from "../lib/fullscreen.ts";
import { pileSuit } from "../lib/pile.ts";
import { DECK, PILE } from "../lib/anchors.ts";
import { useMotion } from "../lib/motion.ts";
import { CardBack, PlayingCard, SuitMark } from "./Card.tsx";
import { HelpAsk } from "./Help.tsx";
import { HostSettingsCog } from "./HostSettings.tsx";
import { PlayerSettingsCog } from "./PlayerSettings.tsx";
import { QrGlyph } from "./QrCode.tsx";

/**
 * The middle of the table, as much of it as a phone in landscape can spare —
 * and, since #131, the whole of this view's furniture as well.
 *
 * **What it carries of the table is the centre and nothing more:** the room
 * code, the draw pile and its count, the card in play with the suit over it when
 * an 8 is live — named, or asked for and not yet given — what the table is
 * waiting for, and somebody asking for help. That is the whole list, and the
 * omission that matters is the hands — nobody else's cards appear here at any
 * size.
 *
 * The sun was on that list until #189 and is deliberately off it now. It was
 * rendered immediately before the draw pile button, so the enlarged version of
 * it could only grow *towards* the deck — and a fat target beside the deck is a
 * mis-tap into the exact violation it accuses. It hangs under this strip now,
 * at the far end from the pile, naming the player it is about.
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
 * **The host's cog and the way back to the rules are here for a third reason:
 * they were nowhere at all** (#194, #195). `HandView` has no header, so the
 * cog rendered in the upright one simply did not exist here, and a host at an
 * IRL table — a host holding a phone sideways, which is the whole point of this
 * view — had to turn the phone upright to reach the house rules. The rules had
 * the same gap and it is worse: landscape is the IRL view, an IRL table is
 * where the new players are, and looking a rule up is a thing that happens
 * mid-hand.
 *
 * Both go in the cluster rather than at the right-hand end, which belongs to
 * the prompt, the sun and the deck. **Where anything new on this strip may go,
 * and why, is stated once on the cluster element itself** — that is the rule to
 * read before adding to this row, and it is deliberately not repeated here.
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
}: {
  room: RoomView;
  game: GameView;
  canDraw: boolean;
  onDraw: () => void;
  offline: boolean;
  /** Somebody else's shout, by name. Your own goes over your cards. */
  helpFrom: { name: string; kind: ShoutKind } | null;
  /** What the table is waiting for, in the words the full table uses. */
  prompt: string;
  /**
   * Whether the prompt is drawn up.
   *
   * It was `mine` until #209, and the rename is the point: the strip has one
   * line for what is going on, and two different things want it read — the
   * table waiting on *you*, and the deck running out, which is nobody's turn
   * and is the most important thing on the screen for five seconds. The caller
   * decides which; this only draws it.
   */
  loud: boolean;
  /** Tapping the room code: the invite, opened by whoever is holding the phone. */
  onShowInvite: () => void;
  /** The way back to the rules, which this view had none of before #195. */
  onShowRules: () => void;
  /** Your own settings (#188). A watcher has no cards, so no cog. */
  hints: boolean;
  onChooseHints: (on: boolean) => void;
  seated: boolean;
  /** Only the host's cog reaches this, and only to set what the cog holds. */
  send: (message: ClientMessage) => void;
}) {
  const { anchor, pileFace } = useMotion();
  const fullscreen = useFullscreen();
  const face = pileFace(game.topCard);
  // The same question the full table's pile asks, answered in the same place: a
  // suit named for the card that is actually up, or one owed and not yet given.
  // Null only while a flight is still landing — see `pileSuit`.
  const suit = pileSuit(game, face);

  // The side insets are the landscape ones, and they are why this strip has
  // ends worth protecting: the room code sits at the left end and the prompt
  // and the sun are pushed to the right by `ml-auto`, so on a phone with an
  // island one or the other is behind hardware, and which one depends on which
  // way the phone was turned. The border still runs the full width — the felt
  // and its edge bleed, the content insets.
  return (
    <header
      className={[
        // One line, and it never wraps — the give is inside the small print at
        // the left instead. The cluster below says why.
        "flex shrink-0 items-center gap-3 border-b border-white/10 py-1",
        "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
      ].join(" ")}
    >
      {/*
        ┌───────────────────────────────────────────────────────────────────┐
        │ THIS IS WHERE ANYTHING NEW ON THIS STRIP GOES, AND HERE IS WHY.   │
        └───────────────────────────────────────────────────────────────────┘

        The strip is one line and must stay one line. A row that wraps has to
        wrap *something*, and what it picks is whatever no longer fits — which
        at the right-hand end is the draw pile, the one thing on this strip that
        has to be reachable, and a card's height to push onto a second row. That
        height comes straight off the hand, because `handHeight` measures the
        room the strip leaves.

        This cluster is the release valve. It is all small print, so it wraps
        *within itself* before the strip does, and two wrapped lines of it still
        come to less than the 56px pile card beside them — so the crowded case (a
        missed call, an offer of help, a shout and a dead socket at once) costs
        the cards nothing.

        **So: the right-hand end belongs to the prompt, the sun and the deck, and
        this cluster is the only part of the row a new control may take its width
        from.** Nothing else on this strip may grow.

        It is also the correct end on its own merits: the right is the draw reach
        (#117), and a control beside it is a control under a thumb aimed at
        something else.

        What is already here, and why each earned its place:

        - The sort and the offer of help — the alternative was a row of them
          under the cards, which cost the hand a card size (#131).
        - The offer of the screen — `RotatePanel` is shown only to a phone held
          *upright*, and a phone already sideways when the cards come out is
          never prompted, so the app's one offer of screen space was unreachable
          from the orientation it is about. Absent rather than disabled where the
          API doesn't exist; it takes itself away once fullscreen is held and
          comes back if the browser drops it.
        - The host's cog (#194) and the way back to the rules (#195) — this view
          had neither, and they are the same question with the same answer. A
          host at an IRL table is a host holding a phone sideways, which is the
          entire point of this view, and could not reach the house rules without
          turning it upright; and "what happens if I can't play anything?" is
          asked mid-hand, at exactly the table where the new players are.
      */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
        {/* Yours first and the host's second — the same order and the same two
            glyphs as the upright header, so the pair means the same thing
            whichever way the phone is held, and the host's door into the table
            is in the same corner either way. They go beside each other rather
            than one in place of the other, and must stay legible as different
            things: a person and a gear, one of which changes the game for
            everybody (#188). */}
        {seated ? (
          <PlayerSettingsCog hints={hints} onHints={onChooseHints} className="-my-1" />
        ) : null}

        {room.hostId === game.you ? (
          <HostSettingsCog
            rules={room.houseRules}
            irl={room.irl}
            dealerMode={room.dealerMode}
            shuffleSeats={room.shuffleSeats}
            onRules={(rules) => send({ t: "setHouseRules", rules })}
            onIrl={(on) => send({ t: "setIrl", on })}
            onDealerMode={(mode) => send({ t: "setDealerMode", mode })}
            onShuffleSeats={(on) => send({ t: "setShuffleSeats", on })}
            // 44px of target painted out of 36px of row: a full-height line
            // would spend the cluster's slack, and what it spends it out of is
            // the hand. The negative margin keeps the target whole and hands the
            // layout back the difference.
            className="-my-1"
          />
        ) : null}

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

        {/* The same screen the upright header opens, and the same one #196 is
            reshaping — five headlines you can expand. It opens without the
            first-run hints question: that belongs to the first time through,
            not to a mid-hand look-up. Nothing pauses behind it, exactly as
            upright — the game is on the server, and a challenge window can
            close while you are reading, which is the deal the full table has
            always had. */}
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

      {/* Not a game fact, and the one thing here that isn't: a player blocked on
          a dead socket needs to know that's what it is. */}
      {offline ? <span className="shrink-0 text-xs text-amber-300">reconnecting…</span> : null}

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
