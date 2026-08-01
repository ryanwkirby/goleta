/**
 * The WebSocket layer: one connection per browser, one referee behind them all.
 *
 * Clients send intents; the server runs them through the engine and pushes back
 * a redacted state plus the events that produced it. Redaction happens per
 * recipient, so two people watching the same table receive different bytes.
 */

import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import type { ClientMessage, GameEvent, PlayerId, ServerMessage } from "@goleta/engine";

import {
  RoomError,
  addBot,
  applySeatIntent,
  beginGame,
  findRoom,
  gameViewFor,
  joinRoom,
  markDisconnected,
  nextBotMove,
  createRoom,
  rejoinRoom,
  removeSeat,
  roomView,
  setStartingHandSize,
  wouldCloseSunnyWindow,
  type Room,
  type RoomStore,
} from "./rooms.ts";

const HEARTBEAT_MS = 30_000;

export interface BotTiming {
  /** A bot's ordinary move, paced so people can follow what happened. */
  move: number;
  /** A bot calling the Sunny Rule. */
  call: number;
  /**
   * How long a bot waits before taking an action that would shut an open
   * challenge window. Without this, a bot on the next seat would close the
   * window instantly and no human could ever get a call in.
   */
  sunnyGrace: number;
}

export const DEFAULT_BOT_TIMING: BotTiming = { move: 800, call: 1200, sunnyGrace: 3500 };

interface Client {
  socket: WebSocket;
  code: string | null;
  /** Null for a table screen or spectator: they see the board and hold no cards. */
  playerId: PlayerId | null;
  alive: boolean;
}

export interface SocketDeps {
  store: RoomStore;
  onChange: () => void;
  /** Tests run the bots flat out; people need them slower than that. */
  botTiming?: BotTiming;
}

const send = (client: Client, message: ServerMessage): void => {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(message));
  }
};

export const attachSockets = (
  server: Server,
  { store, onChange, botTiming = DEFAULT_BOT_TIMING }: SocketDeps,
): (() => void) => {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });
  const clients = new Set<Client>();
  const botTimers = new Map<string, NodeJS.Timeout>();

  /** Everyone in the room gets their own view of the same moment. */
  const broadcast = (room: Room, events: readonly GameEvent[] = []): void => {
    for (const client of clients) {
      if (client.code !== room.code) continue;
      send(client, {
        t: "state",
        room: roomView(room),
        game: gameViewFor(room, client.playerId),
        events: [...events],
      });
    }
    onChange();
  };

  const scheduleBots = (room: Room): void => {
    if (botTimers.has(room.code)) return;
    const move = nextBotMove(room);
    if (!move) return;

    const delay =
      move.intent.type === "callSunny"
        ? botTiming.call
        : wouldCloseSunnyWindow(room, move.seat.id, move.intent)
          ? botTiming.sunnyGrace
          : botTiming.move;

    const timer = setTimeout(() => {
      botTimers.delete(room.code);
      // Recomputed rather than replayed: a human may have moved in the meantime.
      const now = nextBotMove(room);
      if (!now) return;
      const outcome = applySeatIntent(room, now.seat.id, now.intent);
      if (outcome.ok) broadcast(room, outcome.events);
      scheduleBots(room);
    }, delay);
    timer.unref?.();
    botTimers.set(room.code, timer);
  };

  const attach = (client: Client, room: Room, playerId: PlayerId | null, token: string | null) => {
    client.code = room.code;
    client.playerId = playerId;
    send(client, { t: "welcome", code: room.code, playerId, token });
    broadcast(room);
    scheduleBots(room);
  };

  const handle = (client: Client, message: ClientMessage): void => {
    if (message.t === "ping") return send(client, { t: "pong" });

    if (message.t === "create") {
      const { room, seat } = createRoom(store, message.name);
      return attach(client, room, seat.id, seat.token);
    }
    if (message.t === "join") {
      const { room, seat } = joinRoom(store, message.code, message.name);
      return attach(client, room, seat.id, seat.token);
    }
    if (message.t === "rejoin") {
      const { room, seat } = rejoinRoom(store, message.code, message.playerId, message.token);
      return attach(client, room, seat.id, seat.token);
    }
    if (message.t === "watch") {
      const room = findRoom(store, message.code);
      return attach(client, room, null, null);
    }

    // Everything below needs a seat at a table.
    if (!client.code) throw new RoomError("join a room first");
    const room = findRoom(store, client.code);
    const playerId = client.playerId;
    if (!playerId) throw new RoomError("you're watching this table, not playing it");

    switch (message.t) {
      case "intent": {
        const outcome = applySeatIntent(room, playerId, message.intent);
        if (!outcome.ok) throw new RoomError(outcome.error ?? "that move isn't allowed");
        broadcast(room, outcome.events);
        return scheduleBots(room);
      }
      case "start": {
        const events = beginGame(room, playerId);
        broadcast(room, events);
        return scheduleBots(room);
      }
      case "setStartingHandSize":
        setStartingHandSize(room, playerId, message.value);
        return broadcast(room);
      case "addBot":
        addBot(room, playerId);
        return broadcast(room);
      case "removeSeat":
        removeSeat(room, playerId, message.playerId);
        return broadcast(room);
    }
  };

  wss.on("connection", (socket: WebSocket) => {
    const client: Client = { socket, code: null, playerId: null, alive: true };
    clients.add(client);

    socket.on("pong", () => {
      client.alive = true;
    });

    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return send(client, { t: "error", message: "that wasn't valid JSON" });
      }
      try {
        handle(client, message);
      } catch (error) {
        const text = error instanceof RoomError ? error.message : "something went wrong";
        if (!(error instanceof RoomError)) console.error("[ws]", error);
        send(client, { t: "error", message: text });
      }
    });

    socket.on("close", () => {
      clients.delete(client);
      if (!client.code || !client.playerId) return;
      const room = store.get(client.code);
      if (!room) return;
      markDisconnected(room, client.playerId);
      broadcast(room);
    });
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.socket.terminate();
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  return () => {
    clearInterval(heartbeat);
    for (const timer of botTimers.values()) clearTimeout(timer);
    botTimers.clear();
    // `wss.close()` stops new connections but leaves the open ones holding the
    // HTTP server up, so shutdown hangs until every browser wanders off.
    for (const client of clients) client.socket.close(1001, "server shutting down");
    clients.clear();
    wss.close();
  };
};
