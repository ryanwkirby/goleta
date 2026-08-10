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
  moveSeat,
  nextBotMove,
  roomView,
  setBotSpeed,
  setHouseRules,
  setIrl,
  type Room,
} from "../src/rooms.ts";

/**
 * The options the game was actually dealt under. Read through a call rather
 * than off `room.game` directly: the tests below clear the game and deal again,
 * and TypeScript narrows the field to `null` across a mutation it can't see.
 */
const dealtOptions = (room: Room) => room.game?.options;

/** A room with the host in seat one and bots filling it out to `size`. */
const seatedRoom = (size = MIN_TABLE_PLAYERS): Room => {
  const { room } = createRoom(createStore(), "Ryan");
  while (room.seats.length < size) addBot(room, room.hostId);
  return room;
};

/** The table in the order it is sitting, which is the order it plays in. */
const seatOrder = (room: Room): string[] => room.seats.map((seat) => seat.name);

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

describe("moving a seat", () => {
  it("swaps a seat with the one it moves past", () => {
    const room = seatedRoom();
    const [first, second] = seatOrder(room);

    moveSeat(room, room.hostId, room.seats[1]?.id ?? "", "up");
    expect(seatOrder(room).slice(0, 2)).toEqual([second, first]);

    moveSeat(room, room.hostId, room.seats[0]?.id ?? "", "down");
    expect(seatOrder(room).slice(0, 2)).toEqual([first, second]);
  });

  it("carries a seat the length of the table one place at a time", () => {
    const room = seatedRoom();
    const last = room.seats[room.seats.length - 1]?.id ?? "";

    for (let step = room.seats.length - 1; step > 0; step -= 1) {
      moveSeat(room, room.hostId, last, "up");
    }

    expect(room.seats[0]?.id).toBe(last);
    expect(new Set(seatOrder(room)).size).toBe(room.seats.length);
  });

  it("does nothing at either end rather than refusing", () => {
    const room = seatedRoom();
    const before = seatOrder(room);

    // The arrow that would do this is disabled; a tap that arrives anyway means
    // the table moved, and that is not worth an error banner.
    expect(() => moveSeat(room, room.hostId, room.seats[0]?.id ?? "", "up")).not.toThrow();
    expect(() =>
      moveSeat(room, room.hostId, room.seats[room.seats.length - 1]?.id ?? "", "down"),
    ).not.toThrow();
    expect(seatOrder(room)).toEqual(before);
  });

  it("is the host's to do, and only between games", () => {
    const room = seatedRoom();
    const guest = room.seats[1]?.id ?? "";
    expect(() => moveSeat(room, guest, guest, "up")).toThrow(/Only the host/);

    beginGame(room, room.hostId);
    expect(() => moveSeat(room, room.hostId, guest, "up")).toThrow(/Wait for this game/);
  });

  it("refuses a seat that isn't at this table", () => {
    const room = seatedRoom();
    expect(() => moveSeat(room, room.hostId, "someone-who-left", "up")).toThrow(/Nobody by that id/);
  });

  it("needs no IRL room, because the order is real in every room", () => {
    const room = seatedRoom();
    expect(room.irl).toBe(false);

    // Which rooms are worth *offering* this in is the lobby's call. Refusing it
    // here would mean flipping an unrelated presentation flag mid-shuffle threw
    // an error at the host.
    moveSeat(room, room.hostId, room.seats[1]?.id ?? "", "up");
    expect(seatOrder(room)[0]).toBe("Robot");
  });

  it("passes the deal round the new order", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    expect(room.dealerId).toBe(room.seats[0]?.id);

    // The deal follows the seat list, so a table rearranged between games gets
    // the same rotation round the order it is now actually sitting in.
    const third = room.seats[2]?.id ?? "";
    if (room.game) room.game.status = "over";
    moveSeat(room, room.hostId, third, "up");
    beginGame(room, room.hostId);

    expect(room.dealerId).toBe(third);
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
    expect(() => setBotSpeed(room, guest, "lightning")).toThrow(/Only the host/);

    beginGame(room, room.hostId);
    expect(() => setBotSpeed(room, room.hostId, "lightning")).toThrow(/Wait for this game/);
    expect(room.botSpeed).toBe("human");
  });
});

describe("house rules", () => {
  it("is the host's to set", () => {
    const room = seatedRoom();
    const guest = room.seats[1]?.id ?? "";
    const rules = { ...roomView(room).houseRules, sunny: false };

    expect(() => setHouseRules(room, guest, rules)).toThrow(/Only the host/);
    expect(roomView(room).houseRules.sunny).toBe(true);
  });

  // Unlike bot speed, which is read live every time a bot is scheduled. These
  // are read once, at the deal, so what they describe is the next game (#134).
  it("can be changed with a game already running", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);

    setHouseRules(room, room.hostId, {
      eights: "nextPlayerNames",
      seedEight: "dealerNames",
      sunny: false,
    });

    expect(roomView(room).houseRules).toEqual({
      eights: "nextPlayerNames",
      seedEight: "dealerNames",
      sunny: false,
    });
  });

  it("leaves the hand already dealt playing the rules it was dealt under", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    const dealtUnder = structuredClone(dealtOptions(room));

    setHouseRules(room, room.hostId, {
      eights: "nextPlayerNames",
      seedEight: "dealerNames",
      sunny: false,
    });

    // The game holds its own copy, taken at `beginGame`. Nothing the host does
    // to the table's rules may reach a hand that is already out.
    expect(dealtOptions(room)).toEqual(dealtUnder);
  });

  it("hands them to the next deal", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    setHouseRules(room, room.hostId, {
      eights: "nextPlayerNames",
      seedEight: "dealerNames",
      sunny: false,
    });

    room.game = null;
    beginGame(room, room.hostId);

    expect(dealtOptions(room)?.eights).toBe("nextPlayerNames");
    expect(dealtOptions(room)?.seedEight).toBe("dealerNames");
    expect(dealtOptions(room)?.sunny).toBeNull();
  });

  it("still refuses a value that is not a rule", () => {
    const room = seatedRoom();
    const rules = roomView(room).houseRules;

    expect(() => setHouseRules(room, room.hostId, { ...rules, eights: "whatever" as never })).toThrow(
      /No such rule/,
    );
    expect(() => setHouseRules(room, room.hostId, { ...rules, sunny: "yes" as never })).toThrow(
      /on or off/,
    );
  });
});

describe("IRL mode", () => {
  it("is off by default, so an online room is untouched", () => {
    expect(roomView(seatedRoom()).irl).toBe(false);
  });

  it("is the host's to set", () => {
    const room = seatedRoom();
    const guest = room.seats[1]?.id ?? "";

    expect(() => setIrl(room, guest, true)).toThrow(/Only the host/);
    expect(room.irl).toBe(false);
  });

  it("can be turned on with a game already running, unlike bot speed", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);

    // The point of the flag: nothing it touches is running, so nothing about a
    // live hand stops it moving.
    setIrl(room, room.hostId, true);
    expect(roomView(room).irl).toBe(true);
    expect(() => setBotSpeed(room, room.hostId, "lightning")).toThrow(/Wait for this game/);
  });

  it("leaves the game itself alone", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    const before = JSON.stringify(room.game);

    setIrl(room, room.hostId, true);
    setIrl(room, room.hostId, false);

    // No timer moved, no window shifted, no card went anywhere: the engine
    // never learns this flag exists.
    expect(JSON.stringify(room.game)).toBe(before);
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
