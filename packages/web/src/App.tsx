import { useEffect, useState } from "react";

import { MOVE_MS, SESSION_MS, SessionError } from "./components/Refusal.tsx";
import { hasSeenRules, markRulesSeen, setWantsHints, wantsHints } from "./net/identity.ts";
import { useGoleta } from "./net/useGoleta.ts";
import { Join } from "./screens/Join.tsx";
import { Lobby } from "./screens/Lobby.tsx";
import { Rules } from "./screens/Rules.tsx";
import { Table } from "./screens/Table.tsx";
import { TableScreen } from "./screens/TableScreen.tsx";

/**
 * What a watching screen shows before the table arrives. Deliberately almost
 * nothing: a device pointed at a table is opened once and left alone, and a room
 * that has gone leaves it here rather than dropping somebody into a form they
 * didn't ask for.
 */
function Waiting({ status }: { status: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="font-mono text-sm uppercase tracking-[0.3em] text-white/40">goleta</p>
      <p className="text-sm text-white/50">
        {status === "open" ? "Finding the table…" : "Connecting…"}
      </p>
    </div>
  );
}

export function App() {
  const { status, room, game, playerId, mode, log, shouts, error, clearError, send, leave } =
    useGoleta();
  const [showRules, setShowRules] = useState(false);
  const [seatedOnce, setSeatedOnce] = useState(false);
  /**
   * Whether the table marks up your playable cards. Lives here rather than on
   * `Table` because two screens set it — the rules, and your own cog (#188) —
   * and one is not a child of the other. `localStorage` is the durable copy;
   * this is the one the app reads live (#187).
   */
  const [hints, setHints] = useState(wantsHints);
  const watching = mode !== "play";

  // First time in, explain the game before the lobby — everything except how the
  // Sunny Rule actually works, which people meet by having it called on them.
  // Not for a watcher: `markRulesSeen` would be the one thing a watching browser
  // wrote to storage.
  useEffect(() => {
    if (room && !seatedOnce && !watching) {
      setSeatedOnce(true);
      if (!hasSeenRules()) setShowRules(true);
    }
  }, [room, seatedOnce, watching]);

  // Every refusal clears itself, timed here rather than inside whichever component
  // draws it: a move refusal is placed against the hand by the layout that is
  // showing, and there are arrangements where nothing draws it at all. Keyed on
  // `id`, so a second refusal restarts the clock.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, error.kind === "move" ? MOVE_MS : SESSION_MS);
    return () => clearTimeout(timer);
  }, [error?.id, error?.kind, clearError]);

  const dismissRules = (): void => {
    markRulesSeen();
    setShowRules(false);
  };

  /** Set here rather than only on the way out: it is a switch, and a switch that
   * waits for a Continue button is a form. */
  const chooseHints = (wanted: boolean): void => {
    setWantsHints(wanted);
    setHints(wanted);
  };

  const body = (() => {
    if (!room) {
      // A screen that came here to watch has nothing to fill in. Showing the join
      // form meanwhile would offer a seat that was never on the table, and a
      // propped device would flash a name field at the room on every reconnect.
      if (watching) return <Waiting status={status} />;
      return (
        <Join send={send} connecting={status !== "open"} underWay={error?.code === "gameUnderWay"} />
      );
    }
    if (showRules) {
      return (
        <div className="flex flex-1 items-start justify-center p-5 sm:items-center">
          <Rules
            onDone={dismissRules}
            ctaLabel={room.status === "lobby" ? "Continue" : "Play"}
            hints={hints}
            onChooseHints={chooseHints}
            // So the screen never describes a rule this table has switched off
            // (#249). Reachable only with a room today, and the default is the
            // game as written for when it isn't.
            houseRules={room.houseRules}
          />
        </div>
      );
    }
    // Takes the room in every state — lobby, game and finished alike — because it
    // is the one screen nobody walks over to touch.
    if (mode === "table") {
      return (
        <TableScreen
          room={room}
          game={game}
          log={log}
          shouts={shouts}
          offline={status !== "open"}
          send={send}
        />
      );
    }

    if (room.status === "lobby" || !game) {
      return (
        <Lobby
          room={room}
          playerId={playerId}
          send={send}
          onShowRules={() => setShowRules(true)}
          onLeave={leave}
        />
      );
    }
    return (
      <Table
        room={room}
        game={game}
        log={log}
        shouts={shouts}
        // Handed down rather than drawn here: it belongs immediately above your own
        // cards, and the hand is two components away. See `Refusal.tsx`.
        refusal={error?.kind === "move" ? error : null}
        send={send}
        onLeave={leave}
        onShowRules={() => setShowRules(true)}
        hints={hints}
        onChooseHints={chooseHints}
        offline={status !== "open"}
      />
    );
  })();

  return (
    <div className="flex flex-1 flex-col bg-felt-950 bg-[radial-gradient(120%_80%_at_50%_0%,var(--color-felt-900),var(--color-felt-950))] text-white">
      {body}

      {/* The move refusal is drawn by the table, against the hand it answers. This
          is everything else. */}
      {error && error.kind !== "move" ? (
        <SessionError key={error.id} error={error} onDismiss={clearError} />
      ) : null}
    </div>
  );
}
