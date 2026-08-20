import type { GameView, RoomView } from "@goleta/engine";

import { Button, Panel } from "../../components/ui.tsx";
import type { NameOf } from "../../lib/format.ts";

/**
 * Who won, and what happens next. The winning line states the reversal out loud
 * — *you kept your cards* — because every intuition from an ordinary card game
 * says the opposite. A stalemate gets its own sentence: "nobody could move" is a
 * real outcome here, not an error.
 *
 * A watcher gets the one offer they are here for, careful about what it
 * promises: the button goes dead when the table is full rather than failing.
 */
export function GameOverPanel({
  room,
  game,
  nameOf,
  isHost,
  seated,
  onDealAgain,
  onJoinNext,
}: {
  room: RoomView;
  game: GameView;
  nameOf: NameOf;
  isHost: boolean;
  seated: boolean;
  onDealAgain: () => void;
  onJoinNext: () => void;
}) {
  const full = room.seats.length >= room.maxPlayers;

  return (
    <Panel className="text-center">
      <p className="text-lg font-semibold text-amber-300">
        {game.winnerId === game.you
          ? "You win — you kept your cards."
          : game.winnerId
            ? `${nameOf(game.winnerId)} wins.`
            : "A dead end. Nobody could move."}
      </p>
      {isHost ? (
        <Button variant="primary" className="mt-3" onClick={onDealAgain}>
          Deal again
        </Button>
      ) : (
        <>
          <p className="mt-2 text-sm text-white/50">
            Waiting for {nameOf(room.hostId)} to deal again.
          </p>
          {!seated ? (
            <div className="mt-4 border-t border-white/10 pt-4">
              <Button variant="primary" onClick={onJoinNext} disabled={full}>
                {full ? "Table is full" : "Join next game"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
