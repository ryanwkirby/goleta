/**
 * The WebSocket layer: one connection per browser, one referee behind them all.
 * Clients send intents; the server runs them through the engine and pushes back
 * a redacted state plus the events that produced it. Redaction happens per
 * recipient, so two people watching one table receive different bytes.
 */

import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import type {
  BotSpeed,
  ClientMessage,
  FeedEvent,
  Intent,
  PlayerId,
  ServerMessage,
} from "@goleta/engine";

import {
  RoomError,
  addBot,
  applySeatIntent,
  beginGame,
  callHeldUntil,
  findRoom,
  gameViewFor,
  holdCall,
  joinRoom,
  markDisconnected,
  moveSeat,
  nextBotMove,
  createRoom,
  rejoinRoom,
  removeSeat,
  roomView,
  seatOf,
  setBotSpeed,
  setDealerMode,
  leaveSeat,
  setAutopilot,
  setHints,
  setHouseRules,
  setIrl,
  setShuffleSeats,
  type Room,
  type RoomStore,
  type Seat,
} from "./rooms.ts";

const HEARTBEAT_MS = 30_000;

export interface BotTiming {
  firstMove: number;
  /** The rest of the turn. A second draw, or the suit named after an 8, is a
   * decision it has effectively already made; sitting on it reads as lag. */
  nextMove: number;
  call: number;
}

/**
 * Two paces, chosen by the host in the lobby. Neither `call` figure is turn
 * pacing: it is the window in which a person can beat the bots to a call they
 * can all see, which is why the human one is long.
 */
export const DEFAULT_BOT_TIMING: Record<BotSpeed, BotTiming> = {
  human: { firstMove: 3000, nextMove: 1000, call: 5000 },
  lightning: { firstMove: 700, nextMove: 700, call: 700 },
};

export interface BotMoveShape {
  call: boolean;
  /** It has already acted this turn, so it isn't deciding from scratch. */
  midTurn: boolean;
}

/**
 * Turn rhythm and nothing else. Whether a challenge window is open — which,
 * since one opens on every draw, is most of the time — does not enter into it: a
 * bot sitting on a decision to leave room for a call against itself reads as lag.
 */
export const botPace = (timing: BotTiming, move: BotMoveShape): number => {
  if (move.call) return timing.call;
  return move.midTurn ? timing.nextMove : timing.firstMove;
};

/** Asking for help is free, but not unlimited: it reaches every screen. */
const SHOUT_COOLDOWN_MS = 2000;

interface Client {
  socket: WebSocket;
  code: string | null;
  playerId: PlayerId | null;
  /** True only for the auxiliary device at the middle of an IRL table. */
  table: boolean;
  alive: boolean;
  lastShoutAt: number;
}

export interface SocketDeps {
  store: RoomStore;
  onChange: () => void;
  /** Tests run the bots flat out; people need them slower than that. */
  botTiming?: Record<BotSpeed, BotTiming>;
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
  /** The last thing a bot did at each table, so a turn can pick up its pace. */
  const botTurns = new Map<string, { playerId: PlayerId; turnNumber: number }>();

  /** The same message to every screen at one table, redaction not involved. */
  const announce = (room: Room, message: ServerMessage): void => {
    for (const client of clients) {
      if (client.code === room.code) send(client, message);
    }
  };

  /** Counted off the open sockets when a view is built rather than kept on the
   * room (#138), so there is no field to clear on load and no way to disagree
   * with the sockets actually open. */
  const tableScreensAt = (room: Room): number => {
    let screens = 0;
    for (const client of clients) {
      if (client.code === room.code && client.table && !client.playerId) screens += 1;
    }
    return screens;
  };

  const broadcast = (room: Room, events: readonly FeedEvent[] = []): void => {
    const screens = tableScreensAt(room);
    for (const client of clients) {
      if (client.code !== room.code) continue;
      send(client, {
        t: "state",
        room: roomView(room, screens),
        game: gameViewFor(room, client.playerId),
        events: [...events],
      });
    }
    onChange();
  };

  /** A bot thinks once a turn and then gets on with it, so only its first action
   * pays the full pause. */
  const paceFor = (room: Room, move: { seat: Seat; intent: Intent }): number => {
    const last = botTurns.get(room.code);
    return botPace(botTiming[room.botSpeed], {
      call: move.intent.type === "callSunny",
      midTurn: last?.playerId === move.seat.id && last.turnNumber === room.game?.turnNumber,
    });
  };

  const scheduleBots = (room: Room): void => {
    if (botTimers.has(room.code)) return;

    // Somebody has the picker open, so the table waits rather than letting a bot
    // shut the window they're deciding in. Re-checked when the wait is up: the
    // hold may have been lifted and replaced since.
    const heldUntil = callHeldUntil(room);
    if (heldUntil > 0) {
      const wait = setTimeout(() => {
        botTimers.delete(room.code);
        scheduleBots(room);
      }, heldUntil - Date.now());
      wait.unref?.();
      botTimers.set(room.code, wait);
      return;
    }

    const move = nextBotMove(room);
    if (!move) {
      botTurns.delete(room.code);
      return;
    }

    const timer = setTimeout(() => {
      botTimers.delete(room.code);
      // Recomputed rather than replayed: a human may have moved in the meantime.
      const now = nextBotMove(room);
      if (!now) return;
      const outcome = applySeatIntent(room, now.seat.id, now.intent);
      if (outcome.ok) {
        botTurns.set(room.code, {
          playerId: now.seat.id,
          turnNumber: room.game?.turnNumber ?? 0,
        });
        broadcast(room, outcome.events);
      }
      scheduleBots(room);
    }, paceFor(room, move));
    timer.unref?.();
    botTimers.set(room.code, timer);
  };

  /**
   * Throw away the move on the clock and work the next one out from scratch. A
   * hold going up has to pre-empt a bot already scheduled, or that bot shuts the
   * very window the hold exists to keep open; coming down has to do the same in
   * reverse.
   */
  const restartBots = (room: Room): void => {
    const pending = botTimers.get(room.code);
    if (pending) clearTimeout(pending);
    botTimers.delete(room.code);
    scheduleBots(room);
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
      client.table = message.table === true;
      return attach(client, room, null, null);
    }

    if (!client.code) throw new RoomError("Join a room first");
    const room = findRoom(store, client.code);
    const playerId = client.playerId;
    /**
     * The shared table screen's one auxiliary action (#120). The `table` bit is
     * the client's own word for what it is, so this narrows rather than grants —
     * what holds the line is the conditions: `drawCard` only, an IRL room only,
     * and a seat with a person behind it. Without that last one a bot would be
     * handed a Sunny violation it did not choose.
     *
     * **`endTurn` is deliberately not on the list** (#260). It can end a turn
     * dishonestly, and a screen in the middle of a table handing somebody a
     * violation they never chose is precisely what the bot check here guards
     * against. It falls through to the refusal below, like `playCard`.
     */
    if (
      !playerId &&
      client.table &&
      message.t === "intent" &&
      message.intent.type === "drawCard" &&
      room.irl &&
      room.game?.phase.kind === "action"
    ) {
      const tablePlayerId = room.game.players[room.game.turnIndex]?.id;
      if (!tablePlayerId) throw new RoomError("No player is up");
      if (seatOf(room, tablePlayerId)?.bot) throw new RoomError("That seat plays itself");
      const outcome = applySeatIntent(room, tablePlayerId, message.intent);
      if (!outcome.ok) throw new RoomError(outcome.error ?? "That move isn't allowed");
      broadcast(room, outcome.events);
      return restartBots(room);
    }
    if (!playerId) throw new RoomError("You're watching this table, not playing it");

    switch (message.t) {
      case "intent": {
        const outcome = applySeatIntent(room, playerId, message.intent);
        if (!outcome.ok) throw new RoomError(outcome.error ?? "That move isn't allowed");
        // You came back, you tapped, it stops (#202). After the move rather than
        // before it: a refused intent is a mis-tap, and a mis-tap should not be
        // what hands your seat back to you halfway across the room.
        setAutopilot(room, playerId, "off");
        broadcast(room, outcome.events);
        // Restarted rather than scheduled: a call submitted from the picker shuts its
        // own window, which lifts the hold.
        return restartBots(room);
      }
      case "start": {
        const events = beginGame(room, playerId);
        broadcast(room, events);
        return scheduleBots(room);
      }
      case "addBot":
        addBot(room, playerId);
        return broadcast(room);
      case "setBotSpeed":
        setBotSpeed(room, playerId, message.speed);
        return broadcast(room);
      case "setIrl":
        // No "wait for this game to finish": this reaches nothing that is running.
        setIrl(room, playerId, message.on);
        return broadcast(room);
      case "setHouseRules":
        setHouseRules(room, playerId, message.rules);
        return broadcast(room);
      case "setDealerMode":
        // Read once at the deal, so what changes is always the next one.
        setDealerMode(room, playerId, message.mode);
        return broadcast(room);
      case "setShuffleSeats":
        setShuffleSeats(room, playerId, message.on === true);
        return broadcast(room);
      case "composingCall":
        // No broadcast: that somebody is weighing a call would be a tell about a
        // verdict nothing else here gives away.
        holdCall(room, playerId, message.open === true);
        return restartBots(room);
      case "help": {
        // Silently dropped rather than refused: a rejected "help" would put an error
        // banner in front of the one player already asking for a hand.
        const now = Date.now();
        if (now - client.lastShoutAt < SHOUT_COOLDOWN_MS) return;
        client.lastShoutAt = now;
        return announce(room, { t: "shout", playerId, kind: "help" });
      }
      case "leave": {
        // Said out loud, so the server stops having to guess at a closed socket
        // (#256). Mid-hand the seat keeps its cards and the autopilot plays them
        // out; between games it simply goes.
        const events = leaveSeat(room, playerId);
        client.playerId = null;
        broadcast(room, events);
        return restartBots(room);
      }
      case "setAutopilot":
        // Stamped from this connection, so it can only ever be your own seat.
        setAutopilot(room, playerId, message.mode);
        broadcast(room);
        // Scheduled rather than left: switching it on mid-wait is the case where
        // the table is already sitting on this seat.
        return restartBots(room);
      case "setHints": {
        // Not host-gated and not frozen mid-game: it changes one screen only.
        const announced = setHints(room, playerId, message.on === true);
        // The mark on the seat goes out either way; the shout only when this switched
        // it on, so a browser re-asserting its preference on reconnect is silent.
        if (announced) announce(room, { t: "shout", playerId, kind: "hints" });
        return broadcast(room);
      }
      case "removeSeat":
        removeSeat(room, playerId, message.playerId);
        return broadcast(room);
      case "moveSeat":
        moveSeat(room, playerId, message.playerId, message.direction);
        return broadcast(room);
    }
  };

  wss.on("connection", (socket: WebSocket) => {
    const client: Client = {
      socket,
      code: null,
      playerId: null,
      table: false,
      alive: true,
      lastShoutAt: 0,
    };
    clients.add(client);

    socket.on("pong", () => {
      client.alive = true;
    });

    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return send(client, { t: "error", message: "That wasn't valid JSON" });
      }
      try {
        handle(client, message);
      } catch (error) {
        const known = error instanceof RoomError;
        if (!known) console.error("[ws]", error);
        send(client, {
          t: "error",
          message: known ? error.message : "Something went wrong",
          ...(known && error.code ? { code: error.code } : {}),
          // A refused `intent` is a mis-tap, so it is the one refusal the client shows
          // and takes away again. Read off the message rather than carried on the
          // error, which would want a class hierarchy for a distinction this
          // branch already has in front of it.
          ...(message.t === "intent" ? { kind: "move" as const } : {}),
        });
      }
    });

    socket.on("close", () => {
      clients.delete(client);
      if (!client.code) return;
      const room = store.get(client.code);
      if (!room) return;
      if (!client.playerId) {
        // A watcher holds no seat, but a shared screen has a row in the lobby and the
        // room has to be told it is gone.
        if (client.table) broadcast(room);
        return;
      }
      markDisconnected(room, client.playerId);
      broadcast(room);
      // They may have gone with the picker still open, leaving the table waiting on
      // a screen that isn't there any more.
      restartBots(room);
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
    botTurns.clear();
    // `wss.close()` stops new connections but leaves open ones holding the HTTP
    // server up, so shutdown hangs until every browser wanders off.
    for (const client of clients) client.socket.close(1001, "server shutting down");
    clients.clear();
    wss.close();
  };
};
