import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ClientMessage,
  ErrorCode,
  ErrorKind,
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
  /**
   * Bumped on every refusal, including a repeat of one word for word.
   *
   * Tap two cards that don't match and the second one has to look like a second
   * answer — but the words are identical, so React keeps the same element and a
   * CSS animation that has already run doesn't run again. Keying the pill on
   * this is what replays it.
   */
  id: number;
  message: string;
  code?: ErrorCode;
  /** How long it's worth showing. See `ErrorKind`. */
  kind: ErrorKind;
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

/**
 * How often this browser says something, and how long it will sit in silence
 * before deciding the socket it is holding is not a connection any more.
 *
 * A socket that *closes* announces itself and the retry below picks it up. A
 * socket that **half-opens** does not: the screen locks, wifi hands over to
 * cellular, the tab is backgrounded — the connection is gone and the browser
 * was never told, so `readyState` stays `OPEN` for as long as anybody cares to
 * look. The server terminated its end a minute earlier and `terminate()` is
 * abrupt, so nothing about it reaches a phone that has left the network. From
 * here the table simply goes quiet, and quiet is what a table between turns
 * looks like too (#183).
 *
 * So the client has to speak first. `ping` and `pong` were already on the wire
 * — nothing new goes out — and the budget is measured against *anything*
 * arriving, not just the answer: a table mid-game is talking constantly.
 *
 * The two figures are picked so the table notices before a turn goes past,
 * rather than before the server does. The server allows 60s (a 30s ping and
 * one miss), and a turn at bot pace is a few seconds. 25s is comfortably under
 * half the server's budget, so this end gives up first and reconnects rather
 * than waiting to be terminated — and it is two and a half pings, so one lost
 * answer never costs anybody a reconnect.
 */
const PING_MS = 10_000;
const SILENCE_MS = 25_000;

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
  const [route, setRoute] = useState(() => routeFromHash());
  const routeRef = useRef(route);
  routeRef.current = route;
  const watching = route.mode !== "play";

  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);
  const logIdRef = useRef(0);
  const shoutIdRef = useRef(0);
  const errorIdRef = useRef(0);
  /** The room we're in, so a reconnect knows what to reclaim. */
  const codeRef = useRef<string | null>(null);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    else queueRef.current.push(message);
  }, []);

  useEffect(() => {
    let retryTimer: number | undefined;
    /**
     * When anything last arrived, and the check that judges it. Both outlive
     * any one socket — the clock is the connection's, not the socket's — and
     * `check` is what the interval and the two wake events below all call.
     */
    let lastHeard = Date.now();
    let check = (): void => {};
    /**
     * Bumped whenever a socket is opened or given up on, so one that has
     * already been written off cannot still fire a retry when its own `close`
     * finally lands. Giving up on a half-open socket is precisely the case
     * where that event arrives late, or never arrives at all.
     */
    let generation = 0;

    const connect = (): void => {
      if (closedRef.current) return;
      const mine = ++generation;
      setStatus((current) => (current === "open" ? "connecting" : current));
      const socket = new WebSocket(socketUrl());
      socketRef.current = socket;
      lastHeard = Date.now();

      /** This socket is over, however it ended: drop it and line up a retry. */
      const lost = (): void => {
        if (mine !== generation) return;
        generation += 1;
        socketRef.current = null;
        if (closedRef.current) return;
        setStatus("closed");
        const wait = RETRY_MS[Math.min(attemptRef.current, RETRY_MS.length - 1)] ?? 8000;
        attemptRef.current += 1;
        retryTimer = window.setTimeout(connect, wait);
      };

      /**
       * Say something, and give up on a socket that has said nothing back.
       *
       * Run on a timer and again the moment this tab is looked at or the
       * machine says it is online — the three ways a connection comes back
       * from the dead without anybody noticing it died. A tab that has been
       * hidden had its timers throttled or frozen, so a budget that ran out
       * while nothing was watching it is judged the same as one that ran out
       * in the open: **a socket nobody could vouch for is not a connection.**
       * The cost of being wrong that way is one `rejoin` round trip; the cost
       * of being wrong the other way is a player shown a board that has moved.
       */
      check = (): void => {
        if (mine !== generation || socket.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastHeard > SILENCE_MS) {
          // Ask for it to be closed, then stop waiting to hear about it — on a
          // network that has gone away the closing handshake is the same
          // silence that got us here.
          socket.close();
          lost();
          return;
        }
        socket.send(JSON.stringify({ t: "ping" } satisfies ClientMessage));
      };

      socket.addEventListener("open", () => {
        lastHeard = Date.now();
        attemptRef.current = 0;
        setStatus("open");

        // Say who is talking before anything queued goes out. A watcher says it
        // on every connection rather than only the first: watching is stateless,
        // so there is nothing to reclaim and nothing to check — a dropped socket
        // or a redeploy just watches again.
        const code = codeRef.current ?? routeRef.current.code;
        const isWatching = routeRef.current.mode !== "play";
        const identity = code && !isWatching ? loadIdentity(code) : null;
        if (code && isWatching) {
          socket.send(
            JSON.stringify({
              t: "watch",
              code,
              ...(routeRef.current.mode === "table" ? { table: true } : {}),
            } satisfies ClientMessage),
          );
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
        // Anything at all counts, `pong` included. What is being measured is
        // whether this socket is still carrying traffic, not whether the
        // server bothered to answer the last question.
        lastHeard = Date.now();
        const message = JSON.parse(String(raw.data)) as ServerMessage;
        switch (message.t) {
          case "welcome": {
            codeRef.current = message.code;
            if (routeRef.current.mode !== "play" && message.playerId) {
              const newRoute = { code: message.code, mode: "play" as ViewMode };
              setRoute(newRoute);
              setHashCode(message.code, "play");
            } else {
              setHashCode(message.code, routeRef.current.mode);
            }
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
            errorIdRef.current += 1;
            setError({
              id: errorIdRef.current,
              message: message.message,
              code: message.code,
              kind: message.kind ?? "session",
            });
            break;
          case "pong":
            break;
        }
      });

      socket.addEventListener("close", lost);
    };

    connect();

    const liveness = window.setInterval(() => check(), PING_MS);
    const wake = (): void => check();
    const woken = (): void => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", woken);
    window.addEventListener("online", wake);

    return () => {
      closedRef.current = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(liveness);
      document.removeEventListener("visibilitychange", woken);
      window.removeEventListener("online", wake);
      socketRef.current?.close();
      socketRef.current = null;
      closedRef.current = false;
    };
  }, []);

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
