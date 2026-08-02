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

const startServer = async (dataDir: string): Promise<Harness> => {
  const store = loadRooms(dataDir, 60_000);
  const persistence = startPersistence(store, dataDir, 5);
  const server: Server = createServer((_, res) => res.end("ok"));
  const detach = attachSockets(server, {
    store,
    onChange: () => persistence.save(),
    botTiming: FLAT_OUT,
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
      if (message.t === "error") this.errors.push(message.message);
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
    expect(impostor.errors.at(-1)).toMatch(/isn't your turn/);
    expect(impostor.game?.turnNumber).toBe(before);
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
    expect(guest.errors.at(-1)).toMatch(/only the host/);
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
    expect(guest.errors.at(-1)).toMatch(/only the host/);

    host.send({ t: "setBotSpeed", speed: "lightning" });
    await guest.until((c) => c.room?.botSpeed === "lightning");
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
});
