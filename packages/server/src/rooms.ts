/**
 * Rooms: seats, host powers, and the one game that a room is playing.
 *
 * The server is the referee. Every intent that arrives from a browser is
 * stamped with the seat it actually came from before it reaches the engine, so
 * a client cannot act as anyone but itself.
 */

import {
  DEFAULT_OPTIONS,
  MAX_TABLE_PLAYERS,
  MIN_TABLE_PLAYERS,
  applyIntent,
  decideBotIntent,
  nextSeed,
  redact,
  redactEvents,
  startGame,
  topCard,
  type EventView,
  type GameEvent,
  type GameState,
  type GameView,
  type Intent,
  type PlayerId,
  type RoomView,
} from "@goleta/engine";

import { newPlayerId, newRoomCode, newSeed, newToken, normaliseCode } from "./ids.ts";

export interface Seat {
  id: PlayerId;
  name: string;
  /** Secret. Proves a returning browser owns this seat; never broadcast. */
  token: string;
  bot: boolean;
  connected: boolean;
  botSeed: number;
}

export interface Room {
  code: string;
  hostId: PlayerId;
  seats: Seat[];
  handsVisible: boolean;
  startingHandSize: number;
  game: GameState | null;
  gamesPlayed: number;
  lastWinnerId: PlayerId | null;
  createdAt: number;
  updatedAt: number;
}

export type RoomStore = Map<string, Room>;

export const createStore = (): RoomStore => new Map();

const MAX_NAME_LENGTH = 16;
const BOT_NAMES = ["Robot", "Automaton", "Clockwork", "Tinny", "Gizmo", "Widget"];

export class RoomError extends Error {}

// Explicitly annotated so TypeScript treats a bare `fail(...)` as terminating
// the branch and narrows what follows.
const fail: (message: string) => never = (message) => {
  throw new RoomError(message);
};

/** Names are shown to everyone at the table, so they get cleaned on the way in. */
export const cleanName = (raw: string): string => {
  const stripped = raw.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
  return stripped.slice(0, MAX_NAME_LENGTH) || "Player";
};

const touch = (room: Room): void => {
  room.updatedAt = Date.now();
};

const seatOf = (room: Room, playerId: PlayerId): Seat | undefined =>
  room.seats.find((seat) => seat.id === playerId);

export const roomStatus = (room: Room): RoomView["status"] => {
  if (!room.game) return "lobby";
  return room.game.status === "over" ? "finished" : "playing";
};

// ---------------------------------------------------------------------------
// Joining and leaving
// ---------------------------------------------------------------------------

const newSeatFor = (name: string, bot: boolean): Seat => ({
  id: newPlayerId(),
  name,
  token: newToken(),
  bot,
  connected: !bot,
  botSeed: newSeed(),
});

export const createRoom = (store: RoomStore, name: string): { room: Room; seat: Seat } => {
  const seat = newSeatFor(cleanName(name), false);
  const room: Room = {
    code: newRoomCode((code) => store.has(code)),
    hostId: seat.id,
    seats: [seat],
    handsVisible: true,
    startingHandSize: DEFAULT_OPTIONS.startingHandSize,
    game: null,
    gamesPlayed: 0,
    lastWinnerId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.set(room.code, room);
  return { room, seat };
};

export const findRoom = (store: RoomStore, code: string): Room =>
  store.get(normaliseCode(code)) ?? fail("no room with that code");

export const joinRoom = (
  store: RoomStore,
  code: string,
  name: string,
): { room: Room; seat: Seat } => {
  const room = findRoom(store, code);
  if (room.game && room.game.status === "playing") {
    fail("that game is already under way — you can watch, or wait for the next one");
  }
  if (room.seats.length >= MAX_TABLE_PLAYERS) fail("that room is full");

  const seat = newSeatFor(cleanName(name), false);
  room.seats.push(seat);
  touch(room);
  return { room, seat };
};

export const rejoinRoom = (
  store: RoomStore,
  code: string,
  playerId: PlayerId,
  token: string,
): { room: Room; seat: Seat } => {
  const room = findRoom(store, code);
  const seat = seatOf(room, playerId);
  if (!seat || seat.token !== token) fail("that seat isn't yours any more");

  seat.connected = true;
  // Somebody has to be able to start the next game. If everyone else has
  // wandered off, the returning player takes the room over.
  const otherHumanHere = room.seats.some((s) => s.id !== seat.id && !s.bot && s.connected);
  if (!otherHumanHere) room.hostId = seat.id;
  touch(room);
  return { room, seat };
};

export const markDisconnected = (room: Room, playerId: PlayerId): void => {
  const seat = seatOf(room, playerId);
  if (!seat) return;
  seat.connected = false;

  // The host's powers move on so the table isn't stranded mid-session.
  if (room.hostId === playerId) {
    const successor = room.seats.find((s) => !s.bot && s.connected);
    if (successor) room.hostId = successor.id;
  }
  touch(room);
};

// ---------------------------------------------------------------------------
// Host powers
// ---------------------------------------------------------------------------

const requireHost = (room: Room, playerId: PlayerId): void => {
  if (room.hostId !== playerId) fail("only the host can do that");
};

export const addBot = (room: Room, byPlayerId: PlayerId): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("wait for this game to finish");
  if (room.seats.length >= MAX_TABLE_PLAYERS) fail("that room is full");

  const taken = new Set(room.seats.map((s) => s.name));
  const name = BOT_NAMES.find((candidate) => !taken.has(candidate)) ?? "Bot";
  room.seats.push(newSeatFor(name, true));
  touch(room);
};

export const removeSeat = (room: Room, byPlayerId: PlayerId, target: PlayerId): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("wait for this game to finish");
  if (target === room.hostId) fail("the host can't be removed");

  room.seats = room.seats.filter((seat) => seat.id !== target);
  touch(room);
};

export const setHandsVisible = (room: Room, byPlayerId: PlayerId, value: boolean): void => {
  requireHost(room, byPlayerId);
  room.handsVisible = value;
  touch(room);
};

export const setStartingHandSize = (room: Room, byPlayerId: PlayerId, value: number): void => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("wait for this game to finish");
  if (!Number.isInteger(value) || value < 3 || value > 10) fail("hands run from 3 to 10 cards");
  room.startingHandSize = value;
  touch(room);
};

export const beginGame = (room: Room, byPlayerId: PlayerId): GameEvent[] => {
  requireHost(room, byPlayerId);
  if (roomStatus(room) === "playing") fail("that game is already under way");
  if (room.seats.length < MIN_TABLE_PLAYERS) {
    fail(`goleta needs ${MIN_TABLE_PLAYERS} players — add a bot to make up the numbers`);
  }

  room.game = startGame(
    room.seats.map((seat) => seat.id),
    newSeed(),
    { deckCount: DEFAULT_OPTIONS.deckCount, startingHandSize: room.startingHandSize },
  );
  touch(room);
  return [{ type: "gameStarted", upcard: topCard(room.game) }];
};

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

export interface IntentOutcome {
  ok: boolean;
  error?: string;
  events: GameEvent[];
}

/**
 * Applies an intent on behalf of one seat. The seat id is stamped onto the
 * intent here rather than trusted from the message, so a client can only ever
 * act as itself.
 */
export const applySeatIntent = (
  room: Room,
  playerId: PlayerId,
  intent: Intent,
): IntentOutcome => {
  const game = room.game;
  if (!game) return { ok: false, error: "no game is running", events: [] };
  if (!seatOf(room, playerId)) return { ok: false, error: "you aren't seated here", events: [] };

  const result = applyIntent(game, { ...intent, playerId });
  if (!result.ok) return { ok: false, error: result.error, events: [] };

  room.game = result.state;
  if (result.state.status === "over" && game.status !== "over") {
    room.gamesPlayed += 1;
    room.lastWinnerId = result.state.winnerId;
  }
  touch(room);
  return { ok: true, events: result.events };
};

/**
 * The next move a bot wants to make, if any. Returns one at a time so the
 * caller can space them out — bots that answered instantly would slam the
 * Sunny window shut before a human could reach for it.
 */
export const nextBotMove = (room: Room): { seat: Seat; intent: Intent } | null => {
  const game = room.game;
  if (!game || game.status !== "playing") return null;

  for (const seat of room.seats) {
    if (!seat.bot) continue;
    const view = redact(game, seat.id, { handsVisible: room.handsVisible });
    const [intent, seed] = decideBotIntent(view, seat.botSeed);
    seat.botSeed = nextSeed(seed);
    if (intent) return { seat, intent };
  }
  return null;
};

/** Whether a move by this player would close an open challenge window. */
export const wouldCloseSunnyWindow = (room: Room, playerId: PlayerId, intent: Intent): boolean => {
  const challenge = room.game?.challenge;
  if (!challenge || challenge.resolved) return false;
  if (intent.type !== "playCard" && intent.type !== "drawCard") return false;
  return challenge.drawerId !== playerId;
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const roomView = (room: Room): RoomView => ({
  code: room.code,
  hostId: room.hostId,
  handsVisible: room.handsVisible,
  startingHandSize: room.startingHandSize,
  seats: room.seats.map((seat) => ({
    id: seat.id,
    name: seat.name,
    bot: seat.bot,
    connected: seat.connected,
    isHost: seat.id === room.hostId,
  })),
  status: roomStatus(room),
  gamesPlayed: room.gamesPlayed,
  minPlayers: MIN_TABLE_PLAYERS,
  maxPlayers: MAX_TABLE_PLAYERS,
  lastWinnerId: room.lastWinnerId,
});

export const gameViewFor = (room: Room, viewerId: PlayerId | null): GameView | null =>
  room.game ? redact(room.game, viewerId, { handsVisible: room.handsVisible }) : null;

export const eventsFor = (
  room: Room,
  viewerId: PlayerId | null,
  events: readonly GameEvent[],
): EventView[] => redactEvents(events, viewerId, { handsVisible: room.handsVisible });

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

export const pruneRooms = (store: RoomStore, maxIdleMs: number, now = Date.now()): number => {
  let removed = 0;
  for (const [code, room] of store) {
    if (now - room.updatedAt <= maxIdleMs) continue;
    store.delete(code);
    removed += 1;
  }
  return removed;
};
