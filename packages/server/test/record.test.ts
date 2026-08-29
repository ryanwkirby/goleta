/**
 * The append-only game record (#359).
 *
 * The point of the file is that the material exists at all, so what is checked
 * here is that a game is legible from its lines alone — header, hands, deck,
 * events, in order — and the two rules that would be silent failures: the
 * credential never reaching the disk, and a failed write never reaching the
 * table.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  addBot,
  applySeatIntent,
  beginGame,
  createRoom,
  createStore,
  joinRoom,
  leaveSeat,
  nextBotMove,
  pruneRooms,
  type Room,
} from "../src/rooms.ts";
import { RECORD_FILE, RECORD_VERSION, startRecorder, type Recorder } from "../src/record.ts";

const dirs: string[] = [];
const recorders: Recorder[] = [];

const scratch = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "goleta-record-"));
  dirs.push(dir);
  return dir;
};

const recorderIn = (dir: string): Recorder => {
  const recorder = startRecorder(dir);
  recorders.push(recorder);
  return recorder;
};

/** The stream is asynchronous, so a read has to wait for what was written. */
const linesIn = async (dir: string): Promise<Record<string, unknown>[]> => {
  await new Promise((resolve) => setTimeout(resolve, 20));
  const file = path.join(dir, RECORD_FILE);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

/** A room of one human and three bots, dealt. */
const dealtRoom = (): { room: Room; hostId: string } => {
  const store = createStore();
  const { room, seat } = createRoom(store, "Ryan");
  addBot(room, seat.id);
  addBot(room, seat.id);
  addBot(room, seat.id);
  return { room, hostId: seat.id };
};

afterEach(() => {
  for (const recorder of recorders.splice(0)) recorder.close();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("the game record", () => {
  it("writes a header at the deal that carries the hands and the deck", async () => {
    const dir = scratch();
    const recorder = recorderIn(dir);
    const { room, hostId } = dealtRoom();

    recorder.record(room, beginGame(room, hostId));

    const lines = await linesIn(dir);
    const header = lines[0];
    if (!header) throw new Error("nothing was written");
    expect(header.t).toBe("game");
    expect(header.v).toBe(RECORD_VERSION);
    expect(header.code).toBe(room.code);
    expect(header.resumed).toBe(false);

    // The engine emits no events for the deal, so without these a record could
    // replay the middle of the table and never the hands.
    const hands = header.hands as Record<string, unknown[]>;
    expect(Object.keys(hands)).toHaveLength(4);
    for (const hand of Object.values(hands)) expect(hand.length).toBeGreaterThan(0);
    const deck = header.deck as unknown[];
    const discard = header.discardPile as unknown[];
    expect(deck.length).toBeGreaterThan(0);

    // The engine's first invariant, holding in the record as well as in the game.
    const dealt = Object.values(hands).reduce((total, hand) => total + hand.length, 0);
    expect(dealt + deck.length + discard.length).toBe(52);

    // Everything a replay needs about the table itself.
    expect(header.seed).toBe(room.game?.rngSeed);
    expect(header.options).toEqual(room.game?.options);
    expect(header.dealerId).toBe(room.dealerId);
    const seats = header.seats as { bot: boolean }[];
    expect(seats).toHaveLength(4);
    expect(seats.filter((seat) => !seat.bot)).toHaveLength(1);
  });

  it("never writes a seat token", async () => {
    const dir = scratch();
    const recorder = recorderIn(dir);
    const { room, hostId } = dealtRoom();
    const tokens = room.seats.map((seat) => seat.token).filter((token) => token.length > 0);
    expect(tokens.length).toBeGreaterThan(0);

    recorder.record(room, beginGame(room, hostId));
    const move = nextBotMove(room);
    if (move) recorder.record(room, applySeatIntent(room, move.seat.id, move.intent).events);

    // Read as raw text rather than per field: the credential must not appear
    // anywhere in the file, however a future line comes to be shaped (#256).
    await linesIn(dir);
    const raw = fs.readFileSync(path.join(dir, RECORD_FILE), "utf8");
    for (const token of tokens) expect(raw).not.toContain(token);
  });

  it("keeps a game's events under one id, and gives the next deal its own", async () => {
    const dir = scratch();
    const recorder = recorderIn(dir);
    const { room, hostId } = dealtRoom();

    recorder.record(room, beginGame(room, hostId));
    for (let step = 0; step < 12; step += 1) {
      const move = nextBotMove(room);
      if (!move) break;
      recorder.record(room, applySeatIntent(room, move.seat.id, move.intent).events);
    }
    const first = await linesIn(dir);
    const firstId = first[0]?.game as string;
    expect(first.length).toBeGreaterThan(1);
    for (const line of first) expect(line.game).toBe(firstId);

    // A second deal in the same room. Neither the code nor `gamesPlayed`
    // identifies a game on its own, so the id has to move.
    room.game = null;
    recorder.record(room, beginGame(room, hostId));
    const all = await linesIn(dir);
    const secondId = all[all.length - 1]?.game as string;
    expect(secondId).not.toBe(firstId);
    expect(secondId.startsWith(`${room.code}-`)).toBe(true);
  });

  it("records a leave, which rides the same feed and is not a GameEvent", async () => {
    const dir = scratch();
    const recorder = recorderIn(dir);
    const store = createStore();
    const { room, seat } = createRoom(store, "Ryan");
    const guest = joinRoom(store, room.code, "Sam").seat;
    addBot(room, seat.id);
    addBot(room, seat.id);

    recorder.record(room, beginGame(room, seat.id));
    recorder.record(room, leaveSeat(room, guest.id));

    const lines = await linesIn(dir);
    const events = lines.filter((line) => line.t === "event").map((line) => line.event);
    expect(events).toContainEqual({ type: "left", playerId: guest.id });
  });

  it("writes a header for a game it never saw dealt, and says so", async () => {
    const dir = scratch();
    const { room, hostId } = dealtRoom();
    // Dealt before this recorder existed — which is every redeploy, since the
    // process restarts and live rooms come back off the snapshot.
    beginGame(room, hostId);

    const recorder = recorderIn(dir);
    const move = nextBotMove(room);
    if (move) recorder.record(room, applySeatIntent(room, move.seat.id, move.intent).events);

    const lines = await linesIn(dir);
    expect(lines[0]?.t).toBe("game");
    expect(lines[0]?.resumed).toBe(true);
    expect(lines[1]?.t).toBe("event");
    expect(lines[1]?.game).toBe(lines[0]?.game);
  });

  it("forgets a pruned code, so a recycled one cannot inherit its game", async () => {
    const dir = scratch();
    const recorder = recorderIn(dir);
    const store = createStore();
    const { room, seat } = createRoom(store, "Ryan");
    addBot(room, seat.id);
    addBot(room, seat.id);
    addBot(room, seat.id);
    recorder.record(room, beginGame(room, seat.id));
    const firstId = (await linesIn(dir))[0]?.game;

    room.updatedAt = Date.now() - 10_000;
    expect(pruneRooms(store, 1000, Date.now(), (code) => recorder.forget(code))).toBe(1);

    // The same four characters, a new room, a new game.
    const reused: Room = { ...room, game: null, gamesPlayed: 0 };
    recorder.record(reused, beginGame(reused, seat.id));
    const lines = await linesIn(dir);
    expect(lines[lines.length - 1]?.game).not.toBe(firstId);
  });

  it("drops a failed write rather than throwing at the table", async () => {
    // A path that cannot be a directory, so opening the stream fails.
    const blocked = path.join(scratch(), "not-a-dir");
    fs.writeFileSync(blocked, "");
    const recorder = recorderIn(path.join(blocked, "nested"));
    const { room, hostId } = dealtRoom();

    expect(() => recorder.record(room, beginGame(room, hostId))).not.toThrow();
    const move = nextBotMove(room);
    if (move) {
      const outcome = applySeatIntent(room, move.seat.id, move.intent);
      expect(() => recorder.record(room, outcome.events)).not.toThrow();
      expect(outcome.ok).toBe(true);
    }
  });
});
