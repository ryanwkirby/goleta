/**
 * Room bookkeeping that sits between the lobby and the engine — the things a
 * browser can reach but that aren't rules. The wire is covered separately in
 * `integration.test.ts`; this is the store itself.
 */

import { describe, expect, it } from "vitest";

import { MAX_TABLE_PLAYERS, MIN_TABLE_PLAYERS, rollSunnyCall } from "@goleta/engine";

import {
  CALL_HOLD_MS,
  addBot,
  applySeatIntent,
  beginGame,
  callHeldUntil,
  createRoom,
  createStore,
  holdCall,
  markDisconnected,
  nextBotMove,
  roomView,
  setBotSpeed,
  type Room,
} from "../src/rooms.ts";

/** A room with the host in seat one and bots filling it out to `size`. */
const seatedRoom = (size = MIN_TABLE_PLAYERS): Room => {
  const { room } = createRoom(createStore(), "Ryan");
  while (room.seats.length < size) addBot(room, room.hostId);
  return room;
};

const leaderOf = (room: Room): string => {
  const game = room.game;
  if (!game) throw new Error("no game");
  return game.players[game.turnIndex]?.id ?? "";
};

/** Deals again, which a room only allows once the last game is finished. */
const dealAgain = (room: Room): string => {
  if (room.game) room.game.status = "over";
  beginGame(room, room.hostId);
  return leaderOf(room);
};

/** The lowest seed that makes the table's roll come out this way. */
const seedRolling = (call: boolean): number => {
  for (let seed = 1; seed < 10_000; seed += 1) if (rollSunnyCall(seed)[0] === call) return seed;
  throw new Error(`no seed rolls ${call}`);
};

/**
 * Puts the human host plainly in the wrong: a card in their hand is made to
 * match what's showing, and then they reach for the deck anyway.
 */
const hostDrawsWithAPlay = (room: Room): void => {
  beginGame(room, room.hostId);
  const game = room.game;
  if (!game) throw new Error("no game");
  game.turnIndex = game.players.findIndex((player) => player.id === room.hostId);
  const held = game.players[game.turnIndex]?.hand[0];
  if (!held) throw new Error("no cards");
  game.activeSuit = held.suit;

  const outcome = applySeatIntent(room, room.hostId, { type: "drawCard", playerId: room.hostId });
  expect(outcome.ok).toBe(true);
  // Read back off the room: `applySeatIntent` swaps in a new state rather than
  // mutating the one above, so `game` is the position before the reach.
  expect(room.game?.challenge?.violation).not.toBeUndefined();
  expect(room.game?.challenge?.violation).not.toBeNull();
};

/**
 * The same, the other way round: a bot reaches with a play in hand, so the
 * human host is the one who could call it and has a picker to open.
 */
const botDrawsWithAPlay = (room: Room): string => {
  beginGame(room, room.hostId);
  const game = room.game;
  if (!game) throw new Error("no game");
  const bot = room.seats.find((seat) => seat.bot);
  if (!bot) throw new Error("no bot");

  game.turnIndex = game.players.findIndex((player) => player.id === bot.id);
  const held = game.players[game.turnIndex]?.hand[0];
  if (!held) throw new Error("no cards");
  game.activeSuit = held.suit;

  const outcome = applySeatIntent(room, bot.id, { type: "drawCard", playerId: bot.id });
  expect(outcome.ok).toBe(true);
  expect(room.game?.challenge?.drawerId).toBe(bot.id);
  return bot.id;
};

describe("passing the deal", () => {
  it("opens on the seat after the dealer, and the host deals first", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);

    expect(room.dealerId).toBe(room.seats[0]?.id);
    expect(leaderOf(room)).toBe(room.seats[1]?.id);
  });

  it("moves the deal one seat every round, all the way round the table", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);

    const leaders = [leaderOf(room)];
    for (let round = 1; round < room.seats.length; round++) leaders.push(dealAgain(room));

    // Every seat leads exactly once before anyone leads twice.
    expect(new Set(leaders).size).toBe(room.seats.length);
    // And the wheel comes back round.
    expect(dealAgain(room)).toBe(leaders[0]);
  });

  it("starts the rotation over if the last dealer has left the room", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    room.dealerId = "someone-who-left";

    expect(dealAgain(room)).toBe(room.seats[1]?.id);
    expect(room.dealerId).toBe(room.seats[0]?.id);
  });
});

describe("seating", () => {
  it("won't deal to a table below the minimum", () => {
    const room = seatedRoom(MIN_TABLE_PLAYERS - 1);
    expect(() => beginGame(room, room.hostId)).toThrow(
      new RegExp(`needs ${MIN_TABLE_PLAYERS} players`),
    );
  });

  it("gives every bot at a full table its own name", () => {
    const room = seatedRoom(MAX_TABLE_PLAYERS);
    const names = room.seats.map((seat) => seat.name);

    expect(names).toHaveLength(MAX_TABLE_PLAYERS);
    expect(new Set(names).size).toBe(MAX_TABLE_PLAYERS);
  });
});

describe("bot speed", () => {
  it("starts human, and the host can change it between games", () => {
    const room = seatedRoom();
    expect(roomView(room).botSpeed).toBe("human");

    setBotSpeed(room, room.hostId, "lightning");
    expect(roomView(room).botSpeed).toBe("lightning");
  });

  it("is the host's to set, and only between games", () => {
    const room = seatedRoom();
    const guest = room.seats[1]?.id ?? "";
    expect(() => setBotSpeed(room, guest, "lightning")).toThrow(/only the host/);

    beginGame(room, room.hostId);
    expect(() => setBotSpeed(room, room.hostId, "lightning")).toThrow(/wait for this game/);
    expect(room.botSpeed).toBe("human");
  });
});

describe("bots and the Sunny Rule", () => {
  it("calls a violation the table has agreed to, ahead of anyone's ordinary move", () => {
    const room = seatedRoom();
    room.botSeed = seedRolling(true);
    hostDrawsWithAPlay(room);

    const move = nextBotMove(room);
    expect(move?.intent.type).toBe("callSunny");
    expect(room.seats.find((seat) => seat.id === move?.seat.id)?.bot).toBe(true);
  });

  it("lets it go when the roll says so", () => {
    const room = seatedRoom();
    room.botSeed = seedRolling(false);
    hostDrawsWithAPlay(room);

    expect(nextBotMove(room)?.intent.type).not.toBe("callSunny");
  });

  it("rolls once for the whole table, however often the schedule is recomputed", () => {
    const room = seatedRoom();
    room.botSeed = seedRolling(false);
    hostDrawsWithAPlay(room);

    // The window lasts seconds and the bot schedule is worked out afresh on
    // every broadcast. Re-rolling here would walk 70% up to a certainty.
    for (let recompute = 0; recompute < 50; recompute += 1) {
      expect(nextBotMove(room)?.intent.type).not.toBe("callSunny");
    }
    expect(room.sunnyVerdict).toMatchObject({ drawerId: room.hostId, call: false });
  });

  it("forgets its verdict once the window shuts", () => {
    const room = seatedRoom();
    room.botSeed = seedRolling(true);
    hostDrawsWithAPlay(room);
    nextBotMove(room);
    expect(room.sunnyVerdict).not.toBeNull();

    const game = room.game;
    if (!game) throw new Error("no game");
    game.challenge = null;
    nextBotMove(room);
    expect(room.sunnyVerdict).toBeNull();
  });
});

describe("holding the table to name a card", () => {
  it("waits on somebody who has the picker open", () => {
    const room = seatedRoom();
    botDrawsWithAPlay(room);
    expect(callHeldUntil(room)).toBe(0);

    holdCall(room, room.hostId, true, 1000);
    expect(callHeldUntil(room, 1000)).toBe(1000 + CALL_HOLD_MS);
  });

  it("stops waiting when they submit, cancel, or go away", () => {
    const room = seatedRoom();
    botDrawsWithAPlay(room);

    holdCall(room, room.hostId, true, 1000);
    holdCall(room, room.hostId, false, 1000);
    expect(callHeldUntil(room, 1000)).toBe(0);

    holdCall(room, room.hostId, true, 1000);
    markDisconnected(room, room.hostId);
    expect(callHeldUntil(room, 1000)).toBe(0);
  });

  it("gives up on its own, so a dead tab can't strand the table", () => {
    const room = seatedRoom();
    botDrawsWithAPlay(room);
    holdCall(room, room.hostId, true, 1000);

    expect(callHeldUntil(room, 1000 + CALL_HOLD_MS - 1)).toBeGreaterThan(0);
    expect(callHeldUntil(room, 1000 + CALL_HOLD_MS)).toBe(0);

    // And it stays given up: reopening the picker on the same window doesn't
    // wind it back on.
    holdCall(room, room.hostId, true, 1000 + CALL_HOLD_MS);
    expect(callHeldUntil(room, 1000 + CALL_HOLD_MS)).toBe(0);
  });

  it("goes with the window it was taken out on", () => {
    const room = seatedRoom();
    botDrawsWithAPlay(room);
    holdCall(room, room.hostId, true, 1000);

    const game = room.game;
    if (!game) throw new Error("no game");
    game.challenge = null;
    expect(callHeldUntil(room, 1000)).toBe(0);
    expect(room.callHolds).toEqual({});
  });

  it("is one hold per window, so reopening the picker is not a stall button", () => {
    const room = seatedRoom();
    botDrawsWithAPlay(room);

    holdCall(room, room.hostId, true, 1000);
    const deadline = callHeldUntil(room, 1000);

    // Close it and open it again, twenty seconds later. The table stops
    // waiting when it was always going to.
    holdCall(room, room.hostId, false, 21_000);
    holdCall(room, room.hostId, true, 21_000);
    expect(callHeldUntil(room, 21_000)).toBe(deadline);
  });

  it("is refused to anyone who couldn't make the call anyway", () => {
    const room = seatedRoom();
    const drawer = botDrawsWithAPlay(room);

    // The drawer can't accuse themselves, and a spectator has no call to make.
    holdCall(room, drawer, true, 1000);
    holdCall(room, "nobody-in-particular", true, 1000);
    expect(callHeldUntil(room, 1000)).toBe(0);
  });

  it("is refused to a caller still serving a lockout", () => {
    const room = seatedRoom();
    botDrawsWithAPlay(room);
    const game = room.game;
    if (!game) throw new Error("no game");
    game.sunnyLockouts[room.hostId] = game.totalDraws + 3;

    holdCall(room, room.hostId, true, 1000);
    expect(callHeldUntil(room, 1000)).toBe(0);
  });
});
