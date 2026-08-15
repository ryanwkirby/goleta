import type { GameView, RoomView } from "@goleta/engine";

import { Button } from "../components/ui.tsx";
import type { NameOf } from "../lib/format.ts";

/**
 * The end of a hand, on a phone still held sideways.
 *
 * `HandView` is the landscape layout and it is about your cards, so it steps
 * aside the moment there are no more turns to take. What it used to step aside
 * *to* was the upright table — a `max-w-3xl` column on a viewport a little over
 * three hundred pixels tall — which put "Deal again" somewhere below the fold,
 * under the seat strip and the piles, at the end of every single game (#158).
 *
 * Nothing prompts a turn of the phone there either: `RotatePanel` hangs off
 * `irlPhone`, which is false once the game is over, so the one mechanism this
 * app has for saying *turn the phone* is switched off at exactly the moment the
 * layout needs turning.
 *
 * So this is the third landscape screen, and it is deliberately the smallest of
 * them: who won, and the one thing there is to do about it. It fits without
 * scrolling because a phone at a table gets put down between hands, and the
 * button has to be on the screen it was put down on.
 *
 * **`leave` is here and nowhere else in landscape.** During a hand there is
 * nothing to leave in the middle of, and every other room-level control is a
 * turn of the phone away. The end of a session is the one moment somebody
 * actually wants out, and asking them to rediscover the upright table to find
 * it is the same "below the fold" problem wearing a different hat.
 */
export function HandOver({
  room,
  game,
  nameOf,
  seated,
  onDealAgain,
  onJoinNext,
  onLeave,
}: {
  room: RoomView;
  game: GameView;
  nameOf: NameOf;
  /** Whether there is a seat behind this screen, or it is a watcher's phone. */
  seated: boolean;
  onDealAgain: () => void;
  onJoinNext: () => void;
  onLeave: () => void;
}) {
  const host = room.hostId === game.you;
  const full = room.seats.length >= room.maxPlayers;

  return (
    <div
      className={[
        "flex h-dvh flex-col items-center justify-center gap-4 text-center",
        "pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]",
      ].join(" ")}
    >
      <p className="text-balance text-2xl font-semibold text-amber-300">
        {game.winnerId === game.you
          ? "You win — you kept your cards."
          : game.winnerId
            ? `${nameOf(game.winnerId)} wins.`
            : "A dead end. Nobody could move."}
      </p>

      {host ? (
        <Button variant="primary" onClick={onDealAgain}>
          Deal again
        </Button>
      ) : (
        <p className="text-sm text-white/50">
          Waiting for {nameOf(room.hostId)} to deal again.
        </p>
      )}

      {/* A watcher is offered the next game, exactly as upright — and this is
          the more useful place for it, since the same offer upright sits under
          a whole table they have to scroll past to reach. */}
      {!host && !seated ? (
        <Button variant="primary" onClick={onJoinNext} disabled={full}>
          {full ? "Table is full" : "Join next game"}
        </Button>
      ) : null}

      <Button variant="ghost" className="mt-1 px-3 py-1 text-xs" onClick={onLeave}>
        leave
      </Button>
    </div>
  );
}
