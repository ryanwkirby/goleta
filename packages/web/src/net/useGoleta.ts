import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ClientMessage,
  ErrorCode,
  GameEvent,
  GameView,
  RoomView,
  ServerMessage,
} from "@goleta/engine";

import { forgetIdentity, loadIdentity, saveIdentity } from "./identity.ts";
import { routeFromHash, setHashCode, type ViewMode } from "./route.ts";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface LoggedEvent {
  id: number;
  event: GameEvent;
  /** When this reached the browser. The table won't act out old news. */
  at: number;
}

/** Somebody asking for help, out loud. Lives for a couple of seconds. */
export interface Shout {
  id: number;
  playerId: string;
  kind: "help";
}

/**
 * A refusal, as the app has to deal with it. The sentence is for the player;
 * `code` is for the app, on the few refusals it can offer a way out of.
 */
export interface GoletaError {
  message: string;
  code?: ErrorCode;
}

export interface Goleta {
  status: ConnectionStatus;
  room: RoomView | null;
  game: GameView | null;
  playerId: string | null;
  /** What this browser came to do: take a seat, watch, or be the table screen. */
  mode: ViewMode;
  /** Most recent first. */
  log: LoggedEvent[];
  /** Whoever is currently asking for help. Empties itself. */
  shouts: Shout[];
  error: GoletaError | null;
  clearError: () => void;
  send: (message: ClientMessage) => void;
  leave: () => void;
}

const MAX_LOG = 60;
const RETRY_MS = [500, 1000, 2000, 4000, 8000];
/** Long enough to read across the table, short enough to be embarrassing. */
const SHOUT_MS = 2600;

const socketUrl = (): string => {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
};

export const useGoleta = (): Goleta => {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [log, setLog] = useState<LoggedEvent[]>([]);
  const [shouts, setShouts] = useState<Shout[]>([]);
  const [error, setError] = useState<GoletaError | null>(null);
  /**
   * Read once, at the top of the session. The URL is how a screen says what it
   * is for, and nothing after this may change its mind — `welcome` rewrites the
   * hash, and a watcher whose mode got rewritten there would quietly sit down
   * at the table on the next reload.
   */
  const [route] = useState(() => routeFromHash());
  const watching = route.mode !== "play";

  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);
  const logIdRef = useRef(0);
  const shoutIdRef = useRef(0);
  /** The room we're in, so a reconnect knows what to reclaim. */
  const codeRef = useRef<string | null>(null);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    else queueRef.current.push(message);
  }, []);

  useEffect(() => {
    let retryTimer: number | undefined;

    const connect = (): void => {
      if (closedRef.current) return;
      setStatus((current) => (current === "open" ? "connecting" : current));
      const socket = new WebSocket(socketUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        attemptRef.current = 0;
        setStatus("open");

        // Say who is talking before anything queued goes out. A watcher says it
        // on every connection rather than only the first: watching is stateless,
        // so there is nothing to reclaim and nothing to check — a dropped socket
        // or a redeploy just watches again.
        const code = codeRef.current ?? route.code;
        const identity = code && !watching ? loadIdentity(code) : null;
        if (code && watching) {
          socket.send(JSON.stringify({ t: "watch", code } satisfies ClientMessage));
        } else if (code && identity) {
          socket.send(
            JSON.stringify({
              t: "rejoin",
              code,
              playerId: identity.playerId,
              token: identity.token,
            } satisfies ClientMessage),
          );
        }
        for (const message of queueRef.current.splice(0)) socket.send(JSON.stringify(message));
      });

      socket.addEventListener("message", (raw) => {
        const message = JSON.parse(String(raw.data)) as ServerMessage;
        switch (message.t) {
          case "welcome": {
            codeRef.current = message.code;
            setHashCode(message.code, route.mode);
            setPlayerId(message.playerId);
            if (message.playerId && message.token) {
              saveIdentity(message.code, { playerId: message.playerId, token: message.token });
            }
            break;
          }
          case "state": {
            setRoom(message.room);
            setGame(message.game);
            if (message.events.length > 0) {
              const at = Date.now();
              setLog((previous) =>
                [
                  ...message.events
                    .map((event) => ({ id: ++logIdRef.current, event, at }))
                    .toReversed(),
                  ...previous,
                ].slice(0, MAX_LOG),
              );
            }
            break;
          }
          case "shout": {
            // It clears itself: nothing downstream has to remember to forget.
            const shout: Shout = {
              id: ++shoutIdRef.current,
              playerId: message.playerId,
              kind: message.kind,
            };
            setShouts((previous) => [...previous, shout]);
            window.setTimeout(
              () => setShouts((previous) => previous.filter((s) => s.id !== shout.id)),
              SHOUT_MS,
            );
            break;
          }
          case "error":
            setError({ message: message.message, code: message.code });
            break;
          case "pong":
            break;
        }
      });

      socket.addEventListener("close", () => {
        socketRef.current = null;
        if (closedRef.current) return;
        setStatus("closed");
        const wait = RETRY_MS[Math.min(attemptRef.current, RETRY_MS.length - 1)] ?? 8000;
        attemptRef.current += 1;
        retryTimer = window.setTimeout(connect, wait);
      });
    };

    connect();
    return () => {
      closedRef.current = true;
      window.clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
      closedRef.current = false;
    };
  }, [route, watching]);

  const leave = useCallback(() => {
    const code = codeRef.current;
    // A watcher has no seat and nothing in `localStorage` to forget. Reaching
    // for the key anyway would be the one write a watching browser makes.
    if (code && !watching) forgetIdentity(code);
    codeRef.current = null;
    setHashCode(null);
    location.reload();
  }, [watching]);

  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    room,
    game,
    playerId,
    mode: route.mode,
    log,
    shouts,
    error,
    clearError,
    send,
    leave,
  };
};
