import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientMessage, EventView, GameView, RoomView, ServerMessage } from "@goleta/engine";

import { forgetIdentity, loadIdentity, saveIdentity } from "./identity.ts";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface LoggedEvent {
  id: number;
  event: EventView;
  /** When this reached the browser. The table won't act out old news. */
  at: number;
}

export interface Goleta {
  status: ConnectionStatus;
  room: RoomView | null;
  game: GameView | null;
  playerId: string | null;
  /** Most recent first. */
  log: LoggedEvent[];
  error: string | null;
  clearError: () => void;
  send: (message: ClientMessage) => void;
  leave: () => void;
}

const MAX_LOG = 60;
const RETRY_MS = [500, 1000, 2000, 4000, 8000];

const socketUrl = (): string => {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
};

/** `#/r/ABCD` — the shape of a link you can text to somebody. */
export const codeFromHash = (): string | null => {
  const match = /^#\/r\/([A-Za-z0-9]{4})$/.exec(location.hash);
  return match?.[1]?.toUpperCase() ?? null;
};

export const setHashCode = (code: string | null): void => {
  const next = code ? `#/r/${code}` : "";
  if (location.hash !== next) history.replaceState(null, "", next || location.pathname);
};

export const useGoleta = (): Goleta => {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [room, setRoom] = useState<RoomView | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [log, setLog] = useState<LoggedEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);
  const logIdRef = useRef(0);
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

        // Reclaim the seat before anything queued goes out, so the server knows
        // who is talking.
        const code = codeRef.current ?? codeFromHash();
        const identity = code ? loadIdentity(code) : null;
        if (code && identity) {
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
            setHashCode(message.code);
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
          case "error":
            setError(message.message);
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
  }, []);

  const leave = useCallback(() => {
    const code = codeRef.current;
    if (code) forgetIdentity(code);
    codeRef.current = null;
    setHashCode(null);
    location.reload();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { status, room, game, playerId, log, error, clearError, send, leave };
};
