/**
 * Drives the real server over real WebSockets: no mocks, no direct calls into
 * the room store. If a browser can't do it this way, neither can this test.
 */

import { createServer, type Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import {
  DEFAULT_OPTIONS,
  MIN_TABLE_PLAYERS,
  type ClientMessage,
  type GameView,
  type RoomView,
  type ServerMessage,
} from "@goleta/engine";

import { loadRooms, startPersistence } from "../src/persist.ts";
import { attachSockets } from "../src/socket.ts";

interface Harness {
  port: number;
  dataDir: string;
  stop: () => Promise<void>;
  flush: () => void;
}

const started: Harness[] = [];

/** Both speeds run flat out here; the pacing itself is the room store's job. */
const FLAT_OUT = {
  human: { firstMove: 2, nextMove: 2, call: 2 },
  lightning: { firstMove: 2, nextMove: 2, call: 2 },
};

/**
 * Bots that sit on their hands, for the one test that needs to catch a table
 * mid-bot-turn. Flat out, the seat is a bot for microseconds and there is no
 * moment to send anything into; here the turn is simply parked.
 */
const DAWDLING = {
  human: { firstMove: 30_000, nextMove: 30_000, call: 30_000 },
  lightning: { firstMove: 30_000, nextMove: 30_000, call: 30_000 },
};

const startServer = async (dataDir: string, botTiming = FLAT_OUT): Promise<Harness> => {
  const store = loadRooms(dataDir, 60_000);
  const persistence = startPersistence(store, dataDir, 5);
  const server: Server = createServer((_, res) => res.end("ok"));
  const detach = attachSockets(server, {
    store,
    onChange: () => persistence.save(),
    botTiming,
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("no port");

  const harness: Harness = {
    port: address.port,
    dataDir,
    flush: () => persistence.flush(),
    stop: async () => {
      persistence.flush();
      persistence.stop();
      detach();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
  started.push(harness);
  return harness;
};

/** A browser, more or less: sends messages, remembers the last state it saw. */
class TestClient {
  socket: WebSocket;
  playerId: string | null = null;
  token: string | null = null;
  code: string | null = null;
  room: RoomView | null = null;
  game: GameView | null = null;
  errors: string[] = [];
  /** The same refusals with everything the wire carried, `kind` included. */
  refusals: Array<Extract<ServerMessage, { t: "error" }>> = [];
  private waiters: Array<(m: ServerMessage) => boolean> = [];

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as ServerMessage;
      if (message.t === "welcome") {
        this.playerId = message.playerId;
        this.token = message.token;
        this.code = message.code;
      }
      if (message.t === "state") {
        this.room = message.room;
        this.game = message.game;
      }
      if (message.t === "error") {
        this.errors.push(message.message);
        this.refusals.push(message);
      }
      this.waiters = this.waiters.filter((waiter) => !waiter(message));
    });
  }

  async open(): Promise<this> {
    if (this.socket.readyState === WebSocket.OPEN) return this;
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    return this;
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Resolves on the next server message matching `predicate`. */
  next(predicate: (m: ServerMessage) => boolean, timeoutMs = 4000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for a message")), timeoutMs);
      this.waiters.push((message) => {
        if (!predicate(message)) return false;
        clearTimeout(timer);
        resolve(message);
        return true;
      });
    });
  }

  /** Resolves once the client's view satisfies `predicate`. */
  async until(predicate: (client: TestClient) => boolean, timeoutMs = 6000): Promise<void> {
    if (predicate(this)) return;
    await this.next(() => predicate(this), timeoutMs);
  }

  close(): void {
    this.socket.close();
  }
}

const tempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "goleta-test-"));

afterEach(async () => {
  await Promise.all(started.splice(0).map((harness) => harness.stop()));
});

const openClient = async (port: number): Promise<TestClient> => new TestClient(port).open();

/** Bots up to a full table, so a test doesn't have to know the minimum. */
const fillTable = async (host: TestClient, size = MIN_TABLE_PLAYERS): Promise<void> => {
  // oxlint-disable no-await-in-loop -- one bot at a time, same as a host clicking.
  while ((host.room?.seats.length ?? 0) < size) {
    const seated = host.room?.seats.length ?? 0;
    host.send({ t: "addBot" });
    await host.until((c) => (c.room?.seats.length ?? 0) > seated);
  }
};

/**
 * A full table of people with a game running, in a room the host has marked as
 * sitting in the same room. What the shared table screen exists for.
 */
const seatIrlTable = async (
  port: number,
  host: TestClient,
  { irl = true }: { irl?: boolean } = {},
): Promise<TestClient[]> => {
  host.send({ t: "create", name: "Ryan" });
  await host.until((c) => c.room !== null);
  const code = host.code as string;

  const guests = await Promise.all([openClient(port), openClient(port), openClient(port)]);
  // oxlint-disable no-await-in-loop -- seats join one at a time, like the lobby.
  for (const [index, guest] of guests.entries()) {
    guest.send({ t: "join", code, name: `Guest ${index + 1}` });
    await guest.until((c) => c.room !== null);
  }

  if (irl) {
    host.send({ t: "setIrl", on: true });
    await host.until((c) => c.room?.irl === true);
  }
  host.send({ t: "start" });
  await host.until((c) => c.room?.status === "playing");
  return guests;
};

/**
 * Plays a seat the way a person would: look at the view, make the only move
 * the rules leave you, then wait for the table to come back round.
 */
const drive = async (client: TestClient): Promise<void> => {
  // oxlint-disable no-await-in-loop -- taking turns is sequential by nature.
  for (let step = 0; step < 400; step++) {
    const view = client.game;
    if (!view || view.status === "over") return;
    if (view.waitingOn !== client.playerId) {
      await client.next((m) => m.t === "state", 8000).catch(() => undefined);
      continue;
    }
    if (view.phase.kind === "suit") {
      client.send({ t: "intent", intent: { type: "chooseSuit", playerId: "", suit: "H" } });
    } else if (view.phase.kind === "surrender") {
      const card = view.players.find((p) => p.id === client.playerId)?.hand?.[0];
      if (card) {
        client.send({
          t: "intent",
          intent: { type: "surrenderCard", playerId: "", cardId: card.id },
        });
      }
    } else if (view.legalCardIds.length > 0) {
      client.send({
        t: "intent",
        intent: { type: "playCard", playerId: "", cardId: view.legalCardIds[0] as string },
      });
    } else {
      client.send({ t: "intent", intent: { type: "drawCard", playerId: "" } });
    }
    await client.next((m) => m.t === "state", 8000).catch(() => undefined);
  }
};


describe("a room over the wire", () => {
  it("seats people, deals them in, and plays a whole game with bots", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);

    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);
    const code = host.code as string;
    expect(code).toMatch(/^[A-Z2-9]{4}$/);

    const guest = await openClient(server.port);
    guest.send({ t: "join", code, name: "Sam" });
    await guest.until((c) => c.room !== null);

    // Four to a table, so bots make up the numbers.
    host.send({ t: "start" });
    await host.until((c) => c.errors.length > 0);
    expect(host.errors.at(-1)).toMatch(new RegExp(`needs ${MIN_TABLE_PLAYERS} players`));

    await fillTable(host);

    host.send({ t: "start" });
    await host.until((c) => c.room?.status === "playing");
    expect(host.game?.players).toHaveLength(MIN_TABLE_PLAYERS);
    expect(
      host.game?.players.every((p) => p.cardCount === DEFAULT_OPTIONS.startingHandSize),
    ).toBe(true);

    // Hands are up by default, so everyone can see everything.
    await guest.until((c) => c.game !== null);
    expect(guest.game?.players.every((p) => p.hand !== null)).toBe(true);

    // Let the humans play like bots would, and let the game run itself out.
    await Promise.all([drive(host), drive(guest)]);
    await host.until((c) => c.room?.status === "finished", 20_000);
    expect(host.room?.lastWinnerId).toBeTruthy();
    expect(host.game?.status).toBe("over");
  }, 40_000);

  it("won't let a client act as somebody else", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);
    const code = host.code as string;

    const guest = await openClient(server.port);
    guest.send({ t: "join", code, name: "Sam" });
    await guest.until((c) => c.room !== null);
    await fillTable(host);
    host.send({ t: "start" });
    await host.until((c) => c.room?.status === "playing");
    await guest.until((c) => c.game !== null);

    // Whoever is on the clock, the *other* human tries to move for them by
    // putting their id in the intent. The server stamps the real seat on it,
    // so it comes back as an out-of-turn attempt rather than a stolen move.
    const onClock = host.game?.waitingOn;
    const impostor = onClock === host.playerId ? guest : host;
    const before = impostor.game?.turnNumber;
    impostor.send({
      t: "intent",
      intent: { type: "drawCard", playerId: onClock ?? "" },
    });
    await impostor.until((c) => c.errors.length > 0);
    expect(impostor.errors.at(-1)).toMatch(/Not your turn/);
    expect(impostor.game?.turnNumber).toBe(before);
  }, 20_000);

  it("marks a refused move as one, and leaves everything else alone", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);

    const guest = await openClient(server.port);
    guest.send({ t: "join", code: host.code as string, name: "Sam" });
    await guest.until((c) => c.room !== null);

    // A host-only message from a guest: news to be read and acted on, so it
    // arrives unmarked and the client leaves it up.
    guest.send({ t: "addBot" });
    await guest.until((c) => c.refusals.length > 0);
    expect(guest.refusals.at(-1)?.kind).toBeUndefined();

    await fillTable(host);
    host.send({ t: "start" });
    await host.until((c) => c.room?.status === "playing");
    await guest.until((c) => c.game !== null);

    // A refused intent is a mis-tap, whatever the reason. Whoever isn't on the
    // clock has one to hand: a card, out of turn.
    const waiting = guest.game?.waitingOn;
    const offTurn = waiting === guest.playerId ? host : guest;
    const before = offTurn.refusals.length;
    const card = offTurn.game?.players.find((p) => p.id === offTurn.playerId)?.hand?.[0];
    offTurn.send({
      t: "intent",
      intent: { type: "playCard", playerId: offTurn.playerId ?? "", cardId: card?.id ?? "" },
    });
    await offTurn.until((c) => c.refusals.length > before);
    expect(offTurn.refusals.at(-1)?.message).toBe("Not your turn");
    expect(offTurn.refusals.at(-1)?.kind).toBe("move");
  }, 20_000);

  it("keeps host powers to the host", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);

    const guest = await openClient(server.port);
    guest.send({ t: "join", code: host.code as string, name: "Sam" });
    await guest.until((c) => c.room !== null);

    guest.send({ t: "addBot" });
    await guest.until((c) => c.errors.length > 0);
    expect(guest.errors.at(-1)).toMatch(/Only the host/);
    expect(guest.room?.seats).toHaveLength(2);
  }, 20_000);

  it("lets the host set the bot speed, and tells the whole table about it", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);

    const guest = await openClient(server.port);
    guest.send({ t: "join", code: host.code as string, name: "Sam" });
    await guest.until((c) => c.room !== null);
    expect(guest.room?.botSpeed).toBe("human");

    guest.send({ t: "setBotSpeed", speed: "lightning" });
    await guest.until((c) => c.errors.length > 0);
    expect(guest.errors.at(-1)).toMatch(/Only the host/);

    host.send({ t: "setBotSpeed", speed: "lightning" });
    await guest.until((c) => c.room?.botSpeed === "lightning");
  }, 20_000);

  it("lets the host flip IRL mode with a game already running", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);

    const guest = await openClient(server.port);
    guest.send({ t: "join", code: host.code as string, name: "Sam" });
    await guest.until((c) => c.room !== null);
    expect(guest.room?.irl).toBe(false);

    guest.send({ t: "setIrl", on: true });
    await guest.until((c) => c.errors.length > 0);
    expect(guest.errors.at(-1)).toMatch(/Only the host/);

    await fillTable(host);
    host.send({ t: "start" });
    await host.until((c) => c.room?.status === "playing");

    // Bot speed would be refused here. This one isn't, because nothing that is
    // running reads it — and it reaches everyone at the table.
    host.send({ t: "setIrl", on: true });
    await guest.until((c) => c.room?.irl === true);
    expect(guest.room?.status).toBe("playing");
  }, 20_000);
});

describe("coming back", () => {
  it("restores a seat after the connection drops", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);
    const { code, playerId, token } = host;

    const guest = await openClient(server.port);
    guest.send({ t: "join", code: code as string, name: "Sam" });
    await guest.until((c) => c.room !== null);

    host.close();
    await guest.until((c) => c.room?.seats.some((s) => !s.connected) === true);

    const returning = await openClient(server.port);
    returning.send({ t: "rejoin", code: code as string, playerId: playerId as string, token: token as string });
    await returning.until((c) => c.room !== null);
    expect(returning.playerId).toBe(playerId);
    expect(returning.room?.seats.every((s) => s.connected)).toBe(true);
  }, 20_000);

  it("refuses a seat to someone with the wrong token", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);

    const thief = await openClient(server.port);
    thief.send({
      t: "rejoin",
      code: host.code as string,
      playerId: host.playerId as string,
      token: "not-the-token",
    });
    await thief.until((c) => c.errors.length > 0);
    expect(thief.errors.at(-1)).toMatch(/isn't yours/);
    expect(thief.room).toBeNull();
  }, 20_000);

  it("survives a restart with the game still in progress", async () => {
    const dataDir = tempDir();
    const first = await startServer(dataDir);

    const host = await openClient(first.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);
    const { code, playerId, token } = host;

    await fillTable(host);
    host.send({ t: "start" });
    await host.until((c) => c.room?.status === "playing");
    host.send({ t: "setIrl", on: true });
    await host.until((c) => c.room?.irl === true);
    const cardsBefore = host.game?.players.find((p) => p.id === playerId)?.cardCount;

    // The deploy: process goes away, disk stays.
    host.close();
    await first.stop();
    started.length = 0;

    const second = await startServer(dataDir);
    const returning = await openClient(second.port);
    returning.send({
      t: "rejoin",
      code: code as string,
      playerId: playerId as string,
      token: token as string,
    });
    await returning.until((c) => c.game !== null);

    expect(returning.room?.status).toBe("playing");
    expect(returning.game?.players.find((p) => p.id === playerId)?.cardCount).toBe(cardsBefore);
    // Room state, so it is in the snapshot: a table that came back after a
    // redeploy is still a table sitting in the same room.
    expect(returning.room?.irl).toBe(true);
  }, 30_000);
});

describe("what the wire carries", () => {
  it("sends every hand to every client, and never the challenge behind them", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);

    const guest = await openClient(server.port);
    guest.send({ t: "join", code: host.code as string, name: "Sam" });
    await guest.until((c) => c.room !== null);
    await fillTable(host);

    host.send({ t: "start" });
    await host.until((c) => c.room?.status === "playing");
    await guest.until((c) => c.game !== null);

    // Each client is sent the other seats' cards, not a count of them.
    const hostSeenByGuest = guest.game?.players.find((p) => p.id === host.playerId);
    expect(hostSeenByGuest?.hand).toHaveLength(hostSeenByGuest?.cardCount ?? -1);
    const guestSeenByHost = host.game?.players.find((p) => p.id === guest.playerId);
    expect(guestSeenByHost?.hand).toHaveLength(guestSeenByHost?.cardCount ?? -1);

    // Visible hands are not an excuse to relax the rest of the boundary.
    for (const client of [host, guest]) {
      const wire = JSON.stringify(client.game);
      expect(wire).not.toContain("challenge");
      expect(wire).not.toContain("violation");
      expect(wire).not.toContain("snapshot");
    }
  }, 20_000);

  it("carries a shout for help to the whole table, watchers included", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);

    const guest = await openClient(server.port);
    guest.send({ t: "join", code: host.code as string, name: "Sam" });
    await guest.until((c) => c.room !== null);

    const screen = await openClient(server.port);
    screen.send({ t: "watch", code: host.code as string });
    await screen.until((c) => c.room !== null);

    // Asking is public: the point of it is that everyone hears you ask.
    const heard = Promise.all([
      host.next((m) => m.t === "shout"),
      guest.next((m) => m.t === "shout"),
      screen.next((m) => m.t === "shout"),
    ]);
    guest.send({ t: "help" });
    for (const message of await heard) {
      expect(message).toEqual({ t: "shout", playerId: guest.playerId, kind: "help" });
    }

    // A watcher has no seat, so it has no voice either.
    screen.send({ t: "help" });
    await screen.until((c) => c.errors.length > 0);
    expect(screen.errors.at(-1)).toMatch(/watching this table/);
  }, 20_000);

  it("lets a table screen watch without holding cards", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);
    await fillTable(host);
    host.send({ t: "start" });
    await host.until((c) => c.room?.status === "playing");

    const screen = await openClient(server.port);
    screen.send({ t: "watch", code: host.code as string });
    await screen.until((c) => c.game !== null);

    expect(screen.playerId).toBeNull();
    expect(screen.game?.you).toBeNull();
    expect(screen.game?.sunnyCallable).toBe(false);
    screen.send({ t: "intent", intent: { type: "drawCard", playerId: "" } });
    await screen.until((c) => c.errors.length > 0);
    expect(screen.errors.at(-1)).toMatch(/watching this table/);
  }, 20_000);

  it("lets an IRL shared table screen draw for the current player", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    await seatIrlTable(server.port, host);

    const screen = await openClient(server.port);
    screen.send({ t: "watch", code: host.code as string, table: true });
    await screen.until((c) => c.game !== null);
    expect(screen.playerId).toBeNull();

    const waiting = screen.game?.waitingOn as string;
    const before = screen.game?.players.find((player) => player.id === waiting)?.cardCount ?? 0;
    screen.send({ t: "intent", intent: { type: "drawCard", playerId: "" } });
    await screen.until((c) => {
      const player = c.game?.players.find((candidate) => candidate.id === waiting);
      return (player?.cardCount ?? 0) > before;
    });

    expect(screen.game?.players.find((player) => player.id === waiting)?.cardCount).toBe(before + 1);
  }, 20_000);

  it("lets the shared table screen draw and nothing else", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    await seatIrlTable(server.port, host);
    const code = host.code as string;

    const screen = await openClient(server.port);
    screen.send({ t: "watch", code, table: true });
    await screen.until((c) => c.game !== null);

    // The bit widens exactly one message. Everything else a seat may send is
    // refused on the same line an ordinary watcher meets — it holds no cards to
    // play, has no suit to name, and #16 keeps the accusation off a screen the
    // whole room can read over.
    const card = screen.game?.players.find((p) => p.id === screen.game?.waitingOn)?.hand?.[0];
    const seatedOnly: ClientMessage[] = [
      { t: "intent", intent: { type: "playCard", playerId: "", cardId: card?.id ?? "x" } },
      { t: "intent", intent: { type: "chooseSuit", playerId: "", suit: "H" } },
      { t: "intent", intent: { type: "callSunny", playerId: "", cardId: card?.id ?? "x" } },
      { t: "intent", intent: { type: "surrenderCard", playerId: "", cardId: card?.id ?? "x" } },
      { t: "composingCall", open: true },
      { t: "help" },
      { t: "setIrl", on: false },
    ];

    // oxlint-disable no-await-in-loop -- one refusal at a time, in order.
    for (const message of seatedOnly) {
      const seen = screen.errors.length;
      screen.send(message);
      await screen.until((c) => c.errors.length > seen);
      expect(screen.errors.at(-1)).toMatch(/watching this table/);
    }

    expect(host.room?.irl).toBe(true);
  }, 20_000);

  it("keeps the shared-screen draw out of an online room", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    await seatIrlTable(server.port, host, { irl: false });

    // The `table` bit is the client's own word for what it is, so `irl` is the
    // gate that matters: a room of strangers must never take a move from a
    // browser that simply said it was furniture.
    const screen = await openClient(server.port);
    screen.send({ t: "watch", code: host.code as string, table: true });
    await screen.until((c) => c.game !== null);

    const waiting = screen.game?.waitingOn as string;
    const before = screen.game?.players.find((player) => player.id === waiting)?.cardCount ?? 0;
    screen.send({ t: "intent", intent: { type: "drawCard", playerId: "" } });
    await screen.until((c) => c.errors.length > 0);

    expect(screen.errors.at(-1)).toMatch(/watching this table/);
    expect(screen.game?.players.find((player) => player.id === waiting)?.cardCount).toBe(before);
  }, 20_000);

  it("will not draw for a bot from the shared table screen", async () => {
    const server = await startServer(tempDir(), DAWDLING);
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);
    await fillTable(host);
    host.send({ t: "setIrl", on: true });
    await host.until((c) => c.room?.irl === true);
    host.send({ t: "start" });
    await host.until((c) => c.room?.status === "playing");

    const screen = await openClient(server.port);
    screen.send({ t: "watch", code: host.code as string, table: true });
    await screen.until((c) => c.game !== null);

    const bots = new Set(host.room?.seats.filter((seat) => seat.bot).map((seat) => seat.id));
    // Hand the turn on until a bot has it. The bots are parked, so it stays
    // there for as long as the assertion needs.
    // oxlint-disable no-await-in-loop -- one move at a time, waiting on each.
    for (let step = 0; step < 12 && !bots.has(host.game?.waitingOn ?? ""); step += 1) {
      const view = host.game;
      if (view?.waitingOn !== host.playerId) break;
      if (view.phase.kind === "suit") {
        host.send({ t: "intent", intent: { type: "chooseSuit", playerId: "", suit: "H" } });
      } else if (view.legalCardIds.length > 0) {
        const cardId = view.legalCardIds[0] as string;
        host.send({ t: "intent", intent: { type: "playCard", playerId: "", cardId } });
      } else {
        host.send({ t: "intent", intent: { type: "drawCard", playerId: "" } });
      }
      await host.next((m) => m.t === "state", 8000).catch(() => undefined);
    }

    const waiting = screen.game?.waitingOn as string;
    expect(bots.has(waiting)).toBe(true);
    const before = screen.game?.players.find((player) => player.id === waiting)?.cardCount ?? 0;

    screen.send({ t: "intent", intent: { type: "drawCard", playerId: "" } });
    await screen.until((c) => c.errors.length > 0);

    expect(screen.errors.at(-1)).toMatch(/plays itself/);
    expect(screen.game?.players.find((player) => player.id === waiting)?.cardCount).toBe(before);
  }, 20_000);

  it("still refuses an ordinary watcher the draw in an IRL room", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    await seatIrlTable(server.port, host);

    // No `table` bit, so nothing widens: a spectator on `#/r/ABCD/watch` is
    // exactly as mute as they were before the shared screen existed.
    const screen = await openClient(server.port);
    screen.send({ t: "watch", code: host.code as string });
    await screen.until((c) => c.game !== null);

    screen.send({ t: "intent", intent: { type: "drawCard", playerId: "" } });
    await screen.until((c) => c.errors.length > 0);
    expect(screen.errors.at(-1)).toMatch(/watching this table/);
  }, 20_000);

  it("refuses a watcher every message that belongs to a seat", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);
    const code = host.code as string;

    const screen = await openClient(server.port);
    screen.send({ t: "watch", code });
    await screen.until((c) => c.room !== null);

    // Every message below the seat check in `handle`. A watcher can hold no
    // table, take no turn, deal no cards and change no settings — including
    // the ones a host would be allowed, since a watcher is not one.
    const seatedOnly: ClientMessage[] = [
      { t: "intent", intent: { type: "drawCard", playerId: "" } },
      { t: "start" },
      { t: "addBot" },
      { t: "removeSeat", playerId: host.playerId as string },
      { t: "setBotSpeed", speed: "lightning" },
      { t: "setHouseRules", rules: { eights: "nextPlayerNames", seedEight: "natural", sunny: true } },
      { t: "setIrl", on: true },
      { t: "composingCall", open: true },
      { t: "help" },
    ];

    // oxlint-disable no-await-in-loop -- one refusal at a time, in order.
    for (const message of seatedOnly) {
      const seen = screen.errors.length;
      screen.send(message);
      await screen.until((c) => c.errors.length > seen);
      expect(screen.errors.at(-1)).toMatch(/watching this table/);
    }

    // And none of it touched the room.
    expect(host.room?.seats).toHaveLength(1);
    expect(host.room?.botSpeed).toBe("human");
    expect(host.room?.irl).toBe(false);
  }, 20_000);

  it("sends somebody who scans a table mid-game to watch instead of a dead end", async () => {
    const server = await startServer(tempDir());
    const host = await openClient(server.port);
    host.send({ t: "create", name: "Ryan" });
    await host.until((c) => c.room !== null);
    const code = host.code as string;
    await fillTable(host);
    host.send({ t: "start" });
    await host.until((c) => c.room?.status === "playing");

    const latecomer = await openClient(server.port);
    latecomer.send({ t: "join", code, name: "Sam" });
    const refusal = await latecomer.next((m) => m.t === "error");

    // The sentence is for them; the code is for the Join screen, which offers
    // the watch URL rather than leaving them on a form that will keep failing.
    expect(refusal).toMatchObject({ t: "error", code: "gameUnderWay" });
    latecomer.send({ t: "watch", code });
    await latecomer.until((c) => c.game !== null);
    expect(latecomer.game?.you).toBeNull();
  }, 20_000);
});
