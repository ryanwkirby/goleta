import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientMessage, GameView, RoomView, ServerMessage } from "@goleta/engine";

import type {
  ConnectionStatus,
  GoletaError,
  LoggedEvent,
  Shout,
} from "../lib/feed.ts";
import { forgetIdentity, loadIdentity, saveIdentity } from "./identity.ts";
import { routeFromHash, setHashCode, type ViewMode } from "./route.ts";

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
 * How often this browser says something, and how long it sits in silence before
 * deciding the socket it is holding is not a connection any more.
 *
 * A socket that *closes* announces itself. A socket that **half-opens** does
 * not: the screen locks, wifi hands over to cellular, and `readyState` stays
 * `OPEN` for as long as anybody cares to look. From here the table simply goes
 * quiet, and quiet is what a table between turns looks like too (#183).
 *
 * So the client speaks first. `ping`/`pong` were already on the wire, and the
 * budget is measured against *anything* arriving. The server allows 60s, so 25s
 * gives up first and reconnects rather than waiting to be terminated — and it is
 * two and a half pings, so one lost answer never costs a reconnect.
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

  /**
   * Anything that can't go out now waits for the next socket — except a move,
   * which is refused on the spot.
   *
   * The queue is right for `rejoin`, `watch` and the lobby messages: they say
   * *who you are* and *what you want the room to be*, and neither goes stale. An
   * `intent` is the opposite — a decision taken against the board as it stood
   * when the finger came down. Most of the queue survives because the engine
   * refuses it; a **draw** does not, because it is legal or illegal depending on
   * what the board looked like at that instant, and the board moves while a seat
   * is away. A draw that was the only move on the board can arrive as a Sunny
   * violation its player never chose (#152).
   *
   * So it is dropped, and **the drop is said out loud** — swallowing it silently
   * is the *tap it again* problem #150 is about, wearing a different hat. It
   * leans on `status` being honest about a half-open socket, which is why #183
   * landed first.
   */
  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return;
    }
    if (message.t === "intent") {
      errorIdRef.current += 1;
      setError({ id: errorIdRef.current, message: "Not connected", kind: "move" });
      return;
    }
    queueRef.current.push(message);
  }, []);

  useEffect(() => {
    let retryTimer: number | undefined;
    /** Both outlive any one socket — the clock is the connection's, not the
     * socket's — and `check` is what the interval and the wake events all call. */
    let lastHeard = Date.now();
    let check = (): void => {};
    /** Bumped whenever a socket is opened or given up on, so one already written
     * off cannot still fire a retry when its own `close` finally lands. */
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
       * Say something, and give up on a socket that has said nothing back. Run on
       * a timer and again the moment this tab is looked at or the machine says
       * it is online.
       *
       * **Nothing is judged while the tab is hidden**, which is what makes the
       * budget safe to act on: a hidden tab has its timers throttled, so silence
       * there is the browser's doing rather than the network's, and a socket
       * condemned on it would reconnect a backgrounded tab once a minute.
       *
       * Which leaves the guarantee where it belongs: **any board somebody can
       * see has been verified inside the budget.** Coming back from a lock
       * screen is judged the hard way — the cost of being wrong that way is one
       * `rejoin` round trip, and the other way is a player shown a board that
       * has moved.
       */
      check = (): void => {
        if (mine !== generation || socket.readyState !== WebSocket.OPEN) return;
        if (document.visibilityState === "hidden") return;
        if (Date.now() - lastHeard > SILENCE_MS) {
          // Ask for it to be closed, then stop waiting to hear about it: on a network
          // that has gone away the closing handshake is the same silence that
          // got us here.
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

        // Say who is talking before anything queued goes out. A watcher says it on
        // every connection rather than only the first: watching is stateless, so
        // there is nothing to reclaim.
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
        // Anything at all counts, `pong` included: what is measured is whether this
        // socket is still carrying traffic.
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
    // A watcher has no seat and nothing to forget. Reaching for the key anyway
    // would be the one write a watching browser makes.
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
