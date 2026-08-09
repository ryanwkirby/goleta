import type { GameView, RoomView } from "@goleta/engine";

import type { NameOf } from "../lib/format.ts";
import { calledSuit } from "../lib/pile.ts";
import { DECK, PILE } from "../motion/anchors.ts";
import { useMotion } from "../motion/TableMotion.tsx";
import { CardBack, PlayingCard, SUIT_GLYPH, SUIT_LABEL, isRed } from "./Card.tsx";
import { SunnySign } from "./Sunny.tsx";

/**
 * The middle of the table, as much of it as a phone in landscape can spare.
 *
 * **This carries the table centre and nothing more:** the room code, the draw
 * pile and its count, the card in play with the suit named over it when an 8 is
 * live, whose turn it is, and the sun when a call is on offer. That is the whole
 * list, and the omission that matters is the hands — nobody else's cards appear
 * here at any size.
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
}: {
  room: RoomView;
  game: GameView;
  nameOf: NameOf;
  canDraw: boolean;
  onDraw: () => void;
  onCallSunny: (playerId: string) => void;
  offline: boolean;
}) {
  const { anchor, pileFace } = useMotion();
  const face = pileFace(game.topCard);
  // The same question the full table's pile asks, answered in the same place:
  // a suit that has been named, for the card that is actually up. Null while one
  // is owed and while a flight is still landing — see `calledSuit`.
  const called = calledSuit(game, face);
  const target = game.sunnyCallable ? game.sunnyTargetId : null;

  const waiting = game.waitingOn;
  const turn =
    waiting === null
      ? "—"
      : waiting === game.you
        ? "your turn"
        : `${nameOf(waiting)} to play`;

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-3 py-1">
      <span className="font-mono text-xs tracking-[0.2em] text-white/50">{room.code}</span>

      {/*
        Tappable whenever it's your turn, including when you're holding a card
        you could play. Drawing then breaks the rules, and letting you do it
        without a word of warning is the entire point of the Sunny Rule. No
        disabled state, no confirmation — see AGENTS.md. A compressed strip is a
        tempting place to quietly add one; it isn't one.
      */}
      <button
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        aria-label={`Draw a card — ${game.drawPileSize} left`}
        className={[
          "relative flex items-center gap-1.5 rounded-lg transition-transform",
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

      {/* The card in play, at the same size, so the two piles read as the pair
          they are on the full table. */}
      <div className="flex items-center gap-1.5">
        {face ? (
          <PlayingCard card={face} size="sm" anchor={anchor(PILE)} />
        ) : (
          <div
            ref={anchor(PILE)}
            aria-hidden
            className="h-14 w-10 rounded-md border border-dashed border-white/15"
          />
        )}
        {/* The named suit only needs saying when it isn't the one you can see. */}
        {called ? (
          <span
            className={[
              "rounded-full bg-white/10 px-1.5 py-0.5 text-sm font-semibold",
              isRed(called) ? "text-rose-300" : "text-slate-100",
            ].join(" ")}
            aria-label={`${SUIT_LABEL[called]} called`}
          >
            <span aria-hidden>{SUIT_GLYPH[called]}</span>
          </span>
        ) : null}
      </div>

      <span className="ml-auto truncate text-xs text-white/60" aria-live="polite">
        {turn}
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
    </header>
  );
}
