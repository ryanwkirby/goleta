import { useEffect, useState } from "react";

import { Button } from "./components/ui.tsx";
import { hasSeenRules, markRulesSeen } from "./net/identity.ts";
import { useGoleta } from "./net/useGoleta.ts";
import { Join } from "./screens/Join.tsx";
import { Lobby } from "./screens/Lobby.tsx";
import { Rules } from "./screens/Rules.tsx";
import { Table } from "./screens/Table.tsx";

export function App() {
  const { status, room, game, playerId, log, shouts, error, clearError, send, leave } =
    useGoleta();
  const [showRules, setShowRules] = useState(false);
  const [seatedOnce, setSeatedOnce] = useState(false);

  // First time in, explain the game before the lobby. Everything except the
  // Sunny Rule, which people meet by having it called on them.
  useEffect(() => {
    if (room && !seatedOnce) {
      setSeatedOnce(true);
      if (!hasSeenRules()) setShowRules(true);
    }
  }, [room, seatedOnce]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 5000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  const dismissRules = (): void => {
    markRulesSeen();
    setShowRules(false);
  };

  const body = (() => {
    if (!room) return <Join send={send} connecting={status !== "open"} />;
    if (showRules) {
      return (
        <div className="flex min-h-full items-start justify-center p-5 sm:items-center">
          <Rules onDone={dismissRules} ctaLabel={room.status === "lobby" ? "To the table" : "Play"} />
        </div>
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
        send={send}
        onLeave={leave}
        onShowRules={() => setShowRules(true)}
        offline={status !== "open"}
      />
    );
  })();

  return (
    <div className="min-h-full bg-felt-950 bg-[radial-gradient(120%_80%_at_50%_0%,var(--color-felt-900),var(--color-felt-950))] text-white">
      {body}

      {error ? (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-40 flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
        >
          <div className="flex max-w-md items-center gap-3 rounded-xl bg-rose-600 px-4 py-2.5 text-sm text-white shadow-xl">
            <span>{error}</span>
            <Button
              variant="ghost"
              className="min-h-0 px-2 py-0.5 text-xs text-white/80"
              onClick={clearError}
            >
              dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
