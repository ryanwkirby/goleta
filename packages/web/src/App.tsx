import { useEffect, useState } from "react";

import { MoveRefusal, SessionError } from "./components/Refusal.tsx";
import { hasSeenRules, markRulesSeen, setFirstGameHints } from "./net/identity.ts";
import { useGoleta } from "./net/useGoleta.ts";
import { Join } from "./screens/Join.tsx";
import { Lobby } from "./screens/Lobby.tsx";
import { Rules } from "./screens/Rules.tsx";
import { Table } from "./screens/Table.tsx";
import { TableScreen } from "./screens/TableScreen.tsx";

/**
 * What a watching screen shows before the table arrives.
 *
 * Deliberately almost nothing. A device pointed at a table is opened once and
 * left alone, so this is what it displays for a second on the way up and again
 * after every reconnection — and a room that has gone (a code that expired, a
 * table that finished days ago) leaves it here rather than dropping somebody
 * into a form they didn't ask for. The error banner over the top says which.
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
  /** True only for the read on the way in, where the hints are also offered. */
  const [firstRead, setFirstRead] = useState(false);
  const watching = mode !== "play";

  // First time in, explain the game before the lobby. Everything except the
  // Sunny Rule, which people meet by having it called on them.
  //
  // Not for a watcher: they have no move to make, a table screen has nobody
  // standing at it to dismiss anything, and `markRulesSeen` would be the one
  // thing a watching browser wrote to `localStorage`.
  useEffect(() => {
    if (room && !seatedOnce && !watching) {
      setSeatedOnce(true);
      if (!hasSeenRules()) {
        setFirstRead(true);
        setShowRules(true);
      }
    }
  }, [room, seatedOnce, watching]);

  const dismissRules = (): void => {
    markRulesSeen();
    setFirstRead(false);
    setShowRules(false);
  };

  const chooseHints = (wanted: boolean): void => {
    setFirstGameHints(wanted);
    dismissRules();
  };

  const body = (() => {
    if (!room) {
      // A screen that came here to watch has nothing to fill in: the room is
      // in the URL and the connection is already on its way. Showing the join
      // form in the meantime would offer a seat that was never on the table,
      // and a device propped in the middle of one would flash a name field at
      // the room every time it reconnected.
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
            ctaLabel={room.status === "lobby" ? "To the table" : "Play"}
            onChooseHints={firstRead ? chooseHints : undefined}
          />
        </div>
      );
    }
    // A device pointed at the middle of a table and left there. It takes the
    // room in every state — lobby, game and finished alike — because it is the
    // one screen in the room nobody walks over to touch.
    if (mode === "table") {
      return <TableScreen room={room} game={game} log={log} offline={status !== "open"} />;
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
        send={send}
        onLeave={leave}
        onShowRules={() => setShowRules(true)}
        offline={status !== "open"}
      />
    );
  })();

  return (
    <div className="flex flex-1 flex-col bg-felt-950 bg-[radial-gradient(120%_80%_at_50%_0%,var(--color-felt-900),var(--color-felt-950))] text-white">
      {body}

      {/* Keyed on the refusal rather than on nothing, so a second identical one
          is a second notice: the element is torn down and rebuilt, which is
          what restarts both the fade and the clock. */}
      {error?.kind === "move" ? (
        <MoveRefusal key={error.id} error={error} onDone={clearError} />
      ) : null}
      {error && error.kind !== "move" ? (
        <SessionError key={error.id} error={error} onDismiss={clearError} />
      ) : null}
    </div>
  );
}
