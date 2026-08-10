/**
 * The WebSocket layer: one connection per browser, one referee behind them all.
 *
 * Clients send intents; the server runs them through the engine and pushes back
 * a redacted state plus the events that produced it. Redaction happens per
 * recipient, so two people watching the same table receive different bytes.
 */

import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import type {
  BotSpeed,
  ClientMessage,
  GameEvent,
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
  setHouseRules,
  setIrl,
  type Room,
  type RoomStore,
  type Seat,
} from "./rooms.ts";

const HEARTBEAT_MS = 30_000;

export interface BotTiming {
  /** A bot's first action on a turn: the pause that reads as thinking. */
  firstMove: number;
  /**
   * Everything it does after that in the same turn. The second and third draws
   * of a stuck turn, and the suit named after playing an 8, are decisions it
   * has effectively already made — sitting on them just reads as lag.
   */
  nextMove: number;
  /** A bot calling the Sunny Rule. */
  call: number;
}

/**
 * Two paces, chosen by the host in the lobby.
 *
 * `human` is the default and the one a table actually wants: three seconds is
 * about how long a person takes to look at a fresh hand, and a second is about
 * how long the rest of the turn deserves.
 *
 * `lightning` is for anyone who finds the wait tedious: everything at 700ms,
 * which still clears a card's flight across the table (`FLIGHT_MS`, 220ms) with
 * room to spare.
 *
 * Neither `call` figure is turn pacing. It is the window in which a person can
 * beat the bots to a call they can all see, which is why the human one is left
 * long: bots that call correctly (see `SUNNY_CALL_CHANCE`) would otherwise take
 * every call at the table.
 */
export const DEFAULT_BOT_TIMING: Record<BotSpeed, BotTiming> = {
  human: { firstMove: 3000, nextMove: 1000, call: 5000 },
  lightning: { firstMove: 700, nextMove: 700, call: 700 },
};

/** What a bot is about to do, as far as pacing is concerned. */
export interface BotMoveShape {
  /** It is calling the Sunny Rule. */
  call: boolean;
  /** It has already acted this turn, so it isn't deciding from scratch. */
  midTurn: boolean;
}

/**
 * How long that move waits.
 *
 * Turn rhythm, and nothing else. Whether a challenge window happens to be open
 * — which, since a window opens on every draw, is most of the time — does not
 * enter into it. A bot that has decided what to do and then sits on it to leave
 * room for a call against itself just reads as lag.
 *
 * `call` is the one Sunny figure left, and it paces an action a bot is actually
 * taking rather than a wait on the possibility of one.
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
  /** Null for a table screen or spectator: they see the board and hold no cards. */
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

  /**
   * How many shared screens are propped at this table (#138).
   *
   * Counted off the open sockets at the moment a view is built rather than kept
   * on the room, so there is no field to clear on load, nothing to leak when a
   * connection drops, and no way for the number to disagree with the sockets
   * that are actually open. A room has a handful of clients; this is a loop over
   * a handful of objects a few times a turn.
   */
  const tableScreensAt = (room: Room): number => {
    let screens = 0;
    for (const client of clients) {
      if (client.code === room.code && client.table && !client.playerId) screens += 1;
    }
    return screens;
  };

  /** Everyone in the room gets their own view of the same moment. */
  const broadcast = (room: Room, events: readonly GameEvent[] = []): void => {
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

  /**
   * How long this move sits before it happens. A bot thinks once a turn and
   * then gets on with it, so only its first action pays the full pause.
   */
  const paceFor = (room: Room, move: { seat: Seat; intent: Intent }): number => {
    const last = botTurns.get(room.code);
    return botPace(botTiming[room.botSpeed], {
      call: move.intent.type === "callSunny",
      midTurn: last?.playerId === move.seat.id && last.turnNumber === room.game?.turnNumber,
    });
  };

  const scheduleBots = (room: Room): void => {
    if (botTimers.has(room.code)) return;

    // Somebody has the picker open and is choosing a card to name. The table
    // waits on them rather than letting a bot shut the window they're deciding
    // in — see `holdCall`. Re-checked when the wait is up rather than acted on
    // then, since the hold may have been lifted and replaced in the meantime.
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
   * Throw away the move on the clock and work the next one out from scratch.
   *
   * A hold going up has to pre-empt a bot already scheduled, or that bot acts
   * anyway and shuts the very window the hold exists to keep open. Coming down
   * has to do the same in reverse, so the table starts moving again the moment
   * the caller is done rather than at a deadline nobody is waiting on.
   *
   * It restarts the pace of whatever was pending, which only ever means a bot
   * call sitting on its own `call` figure: any bot with an ordinary move to
   * make is waiting on a window that a hold cannot exist inside.
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

    // Everything below needs a table.
    if (!client.code) throw new RoomError("Join a room first");
    const room = findRoom(store, client.code);
    const playerId = client.playerId;
    /**
     * The shared table screen's one auxiliary action: tapping its draw pile
     * draws for whoever is on the clock (#120).
     *
     * The `table` bit is the client's own word for what it is, so this is a
     * narrowing rather than a permission — see `docs/PROTOCOL.md`. What holds
     * the line is the conditions around it: `drawCard` only, an IRL room only,
     * and a seat with a person behind it.
     *
     * That last one is the point of `bot`. The pile is drawn tappable to the
     * whole room and a bot's turn goes past under a finger already reaching, so
     * without it a tap lands on the bot — and a bot made to draw while holding a
     * play has been handed a Sunny violation it did not choose, by somebody who
     * isn't even at the table. Bots are paced and decided on the server for
     * exactly that reason; nothing off a screen gets to move them.
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
        broadcast(room, outcome.events);
        // Restarted rather than scheduled: a call submitted from the picker
        // shuts its own window, which lifts the hold, and the table should get
        // going again now rather than when that hold would have expired.
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
        // No "wait for this game to finish" guard, unlike bot speed above: this
        // one reaches nothing that is running. See `setIrl`.
        setIrl(room, playerId, message.on);
        return broadcast(room);
      case "setHouseRules":
        setHouseRules(room, playerId, message.rules);
        return broadcast(room);
      case "composingCall":
        // No broadcast: whether somebody is weighing a call is theirs, and
        // telling the table would be a tell about a verdict nothing else here
        // gives away.
        holdCall(room, playerId, message.open === true);
        return restartBots(room);
      case "help": {
        // Silently dropped rather than refused: a rejected "help" would put an
        // error banner in front of the one player already asking for a hand.
        const now = Date.now();
        if (now - client.lastShoutAt < SHOUT_COOLDOWN_MS) return;
        client.lastShoutAt = now;
        return announce(room, { t: "shout", playerId, kind: "help" });
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
          // A refused `intent` is a mis-tap and nothing more, so it is the one
          // refusal the client shows and takes away again. Read off the message
          // that caused it rather than carried on the error: the engine's
          // refusals are strings, and the alternative is a class hierarchy for
          // a distinction this branch already has in front of it. Everything
          // else here — a full room, a seat that isn't yours, a setting flipped
          // mid-game — is `session` and stays up.
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
        // A watcher holds no seat, so there is nothing to mark away — but a
        // shared screen has a row in the lobby, and the room has to be told
        // that row is gone. Deleted from `clients` above, so the count this
        // sends is already the new one. An ordinary spectator changes nothing
        // anybody can see and is not worth a broadcast to the whole table.
        if (client.table) broadcast(room);
        return;
      }
      markDisconnected(room, client.playerId);
      broadcast(room);
      // They may have gone with the picker still open, so the table could be
      // waiting on a screen that isn't there any more.
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
    // `wss.close()` stops new connections but leaves the open ones holding the
    // HTTP server up, so shutdown hangs until every browser wanders off.
    for (const client of clients) client.socket.close(1001, "server shutting down");
    clients.clear();
    wss.close();
  };
};
