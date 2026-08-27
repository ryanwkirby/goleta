/**
 * Room bookkeeping that sits between the lobby and the engine — the things a
 * browser can reach but that aren't rules. The wire is covered separately in
 * `integration.test.ts`; this is the store itself.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_TABLE_PLAYERS,
  MIN_TABLE_PLAYERS,
  isPlayable,
  rollSunnyCall,
  type Card,
} from "@goleta/engine";

import {
  CALL_HOLD_MS,
  RESHUFFLE_HOLD_MS,
  RULING_HOLD_MS,
  addBot,
  applySeatIntent,
  beginGame,
  callHeldUntil,
  createRoom,
  createStore,
  holdCall,
  joinRoom,
  leaveSeat,
  markDisconnected,
  moveSeat,
  moveSeatFromTable,
  placeSeat,
  nextBotMove,
  rejoinRoom,
  reshuffleHeldUntil,
  roomView,
  rulingHeldUntil,
  setAutopilot,
  setBotSpeed,
  setDealerMode,
  setHints,
  setHouseRules,
  setIrl,
  setShuffleSeats,
  type Room,
} from "../src/rooms.ts";

/** Read through a call rather than off `room.game` directly: the tests below
 * clear the game and deal again, and TypeScript can't narrow across that. */
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

/** `card("10D")` — the shorthand the engine tests use. */
const card = (spec: string, index = 0): Card => ({
  id: `${spec}#${index}`,
  rank: spec.slice(0, -1) as Card["rank"],
  suit: spec.slice(-1) as Card["suit"],
});

const hostSeat = (room: Room) => room.seats.find((seat) => seat.id === room.hostId);

/** Every card in the game, wherever it is. The count must never change. */
const cardsInPlay = (room: Room): number => {
  const game = room.game;
  if (!game) throw new Error("no game");
  return (
    game.players.reduce((sum, player) => sum + player.hand.length, 0) +
    game.drawPile.length +
    game.discardPile.length
  );
};

/** The lowest seed that makes the table's roll come out this way. */
const seedRolling = (call: boolean): number => {
  for (let seed = 1; seed < 10_000; seed += 1) if (rollSunnyCall(seed)[0] === call) return seed;
  throw new Error(`no seed rolls ${call}`);
};

/** Puts the host plainly in the wrong: a card in their hand is made to match
 * what's showing, and then they reach for the deck anyway. */
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
  // mutating the one above.
  expect(room.game?.challenge?.violation).not.toBeUndefined();
  expect(room.game?.challenge?.violation).not.toBeNull();
};

/**
 * The same the other way round, so the human host is the one who could call.
 *
 * The reach hand is left holding **both** kinds of card, because the tests below
 * name one of each: a legal one, which is what makes the reach a violation at
 * all, and an illegal one, which is what a wrong call is made of. The first
 * falls out of pointing `activeSuit` at `hand[0]`; the second used to be
 * whatever the deal happened to leave over, and about one deal in fifty leaves
 * none — every card playable, and the wrong-call test throwing rather than
 * failing (#385).
 *
 * It is a **swap** with the draw pile rather than a card conjured into the hand:
 * hands plus deck plus pile come to 52 is the first invariant this game has, and
 * several tests in this file count it.
 */
const botDrawsWithAPlay = (room: Room): string => {
  beginGame(room, room.hostId);
  const game = room.game;
  if (!game) throw new Error("no game");
  const bot = room.seats.find((seat) => seat.bot);
  if (!bot) throw new Error("no bot");

  game.turnIndex = game.players.findIndex((player) => player.id === bot.id);
  const hand = game.players[game.turnIndex]?.hand;
  const held = hand?.[0];
  if (!hand || !held) throw new Error("no cards");
  game.activeSuit = held.suit;

  // The top of the pile is its *last* card — index 0 is the bottom, which is
  // where a punishment card is tucked (#364).
  const topRank = game.discardPile[game.discardPile.length - 1]?.rank;
  if (topRank === undefined) throw new Error("no card in play");
  if (!hand.some((one) => !isPlayable(one, game.activeSuit, topRank))) {
    const at = game.drawPile.findIndex((one) => !isPlayable(one, game.activeSuit, topRank));
    const dud = game.drawPile[at];
    const spare = hand[1];
    if (!dud || !spare) throw new Error("no unplayable card anywhere");
    game.drawPile[at] = spare;
    hand[1] = dud;
  }

  const outcome = applySeatIntent(room, bot.id, { type: "drawCard", playerId: bot.id });
  expect(outcome.ok).toBe(true);
  expect(room.game?.challenge?.drawerId).toBe(bot.id);
  return bot.id;
};

/** Every face-down card turned face up, so the next reach has to recycle. The
 * cards go to the *bottom* of the pile, which leaves the card in play where it
 * is and the table still totalling 52. */
const deckRunsOut = (room: Room, at: number): void => {
  beginGame(room, room.hostId);
  const game = room.game;
  if (!game) throw new Error("no game");
  game.discardPile.unshift(...game.drawPile.splice(0));

  const reaching = game.players[game.turnIndex];
  if (!reaching) throw new Error("nobody to draw");
  vi.setSystemTime(at);
  const outcome = applySeatIntent(room, reaching.id, {
    type: "drawCard",
    playerId: reaching.id,
  });
  expect(outcome.ok).toBe(true);
  expect(outcome.events.some((event) => event.type === "reshuffled")).toBe(true);
};

/** A landed call, made by the human host against a bot that reached. */
const callLands = (room: Room, at: number): void => {
  const drawer = botDrawsWithAPlay(room);
  const game = room.game;
  if (!game) throw new Error("no game");
  const legal = game.challenge?.reach.hand.find((one) =>
    isPlayable(one, game.challenge!.reach.activeSuit, game.challenge!.reach.topRank),
  );
  if (!legal) throw new Error("nothing legal to name");
  vi.setSystemTime(at);
  const outcome = applySeatIntent(room, room.hostId, {
    type: "callSunny",
    playerId: room.hostId,
    cardId: legal.id,
  });
  expect(outcome.ok).toBe(true);
  expect(outcome.events.some((event) => event.type === "sunnyCalled")).toBe(true);
  expect(drawer).not.toBe(room.hostId);
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

describe("drawing for the deal", () => {
  it("rotates by default, so a table that never opens the setting is untouched", () => {
    const room = seatedRoom();
    expect(room.dealerMode).toBe("rotate");
    expect(roomView(room).dealerMode).toBe("rotate");

    beginGame(room, room.hostId);
    expect(room.dealerId).toBe(room.seats[0]?.id);
    expect(dealAgain(room)).toBe(room.seats[2]?.id ?? room.seats[0]?.id);
  });

  it("is the host's to set", () => {
    const room = seatedRoom();
    const guest = room.seats[1]?.id ?? "";

    expect(() => setDealerMode(room, guest, "random")).toThrow(/Only the host/);
    expect(room.dealerMode).toBe("rotate");
  });

  it("refuses a mode it does not have", () => {
    const room = seatedRoom();
    expect(() => setDealerMode(room, room.hostId, "whatever" as never)).toThrow(/No such dealer/);
  });

  it("always lands on a seat that is actually at the table", () => {
    const room = seatedRoom(4);
    setDealerMode(room, room.hostId, "random");
    beginGame(room, room.hostId);

    const ids = new Set(room.seats.map((seat) => seat.id));
    for (let round = 0; round < 60; round++) {
      expect(ids.has(room.dealerId ?? "")).toBe(true);
      dealAgain(room);
    }
  });

  it("stops being predictable, which is the whole point of it", () => {
    const room = seatedRoom(4);
    setDealerMode(room, room.hostId, "random");
    beginGame(room, room.hostId);

    const dealers = new Set([room.dealerId]);
    for (let round = 0; round < 60; round++) {
      dealAgain(room);
      dealers.add(room.dealerId);
    }
    // Rotation would give a strict cycle; sixty random draws across four seats
    // landing on one is about 4 × (1/4)^60.
    expect(dealers.size).toBeGreaterThan(1);
  });

  it("applies at the next deal and never to the hand on the table", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    const before = JSON.stringify(room.game);

    // Not frozen mid-game: it is read once, at the deal.
    setDealerMode(room, room.hostId, "random");
    expect(roomView(room).dealerMode).toBe("random");
    expect(JSON.stringify(room.game)).toBe(before);
    expect(() => setBotSpeed(room, room.hostId, "lightning")).toThrow(/Wait for this game/);
  });

  it("goes back to rotating from wherever the random draw left the deal", () => {
    const room = seatedRoom(4);
    setDealerMode(room, room.hostId, "random");
    beginGame(room, room.hostId);

    setDealerMode(room, room.hostId, "rotate");
    const landed = room.seats.findIndex((seat) => seat.id === room.dealerId);
    dealAgain(room);
    expect(room.dealerId).toBe(room.seats[(landed + 1) % room.seats.length]?.id);
  });
});

describe("shuffling the seats", () => {
  it("is off by default, so a table keeps whoever is on its left", () => {
    const room = seatedRoom(4);
    expect(room.shuffleSeats).toBe(false);
    expect(roomView(room).shuffleSeats).toBe(false);

    const before = seatOrder(room);
    beginGame(room, room.hostId);
    for (let round = 0; round < 5; round++) dealAgain(room);
    expect(seatOrder(room)).toEqual(before);
  });

  it("is the host's to set", () => {
    const room = seatedRoom();
    const guest = room.seats[1]?.id ?? "";

    expect(() => setShuffleSeats(room, guest, true)).toThrow(/Only the host/);
    expect(room.shuffleSeats).toBe(false);
  });

  it("changes the order at the deal, and keeps everybody at the table", () => {
    const room = seatedRoom(6);
    setShuffleSeats(room, room.hostId, true);
    const names = seatOrder(room).toSorted();

    let moved = false;
    let order = seatOrder(room);
    beginGame(room, room.hostId);
    for (let round = 0; round < 20; round++) {
      // Nobody joins, nobody leaves, nobody is duplicated: it is a permutation.
      expect(seatOrder(room).toSorted()).toEqual(names);
      if (seatOrder(room).join() !== order.join()) moved = true;
      order = seatOrder(room);
      dealAgain(room);
    }
    expect(moved).toBe(true);
  });

  it("says so on the event that describes the deal", () => {
    const room = seatedRoom(4);
    expect(beginGame(room, room.hostId)[0]).toMatchObject({ seatsShuffled: false });

    room.game = null;
    setShuffleSeats(room, room.hostId, true);
    expect(beginGame(room, room.hostId)[0]).toMatchObject({ seatsShuffled: true });
  });

  it("does not lose the dealer across a shuffle", () => {
    const room = seatedRoom(5);
    setShuffleSeats(room, room.hostId, true);
    beginGame(room, room.hostId);

    for (let round = 0; round < 20; round++) {
      const dealt = room.dealerId;
      // The last dealer is looked up by id, so a reshuffle finds them wherever
      // they landed and the deal moves one along from there.
      const wasAt = room.seats.findIndex((seat) => seat.id === dealt);
      expect(wasAt).toBeGreaterThanOrEqual(0);
      dealAgain(room);
      expect(room.seats.some((seat) => seat.id === room.dealerId)).toBe(true);
    }
  });

  it("applies at the next deal and never to the hand on the table", () => {
    const room = seatedRoom(4);
    beginGame(room, room.hostId);
    const order = seatOrder(room);
    const before = JSON.stringify(room.game);

    setShuffleSeats(room, room.hostId, true);
    expect(roomView(room).shuffleSeats).toBe(true);
    expect(seatOrder(room)).toEqual(order);
    expect(JSON.stringify(room.game)).toBe(before);
  });

  it("reads sensibly alongside a random dealer, with both on", () => {
    const room = seatedRoom(4);
    setShuffleSeats(room, room.hostId, true);
    setDealerMode(room, room.hostId, "random");
    beginGame(room, room.hostId);

    const names = seatOrder(room).toSorted();
    for (let round = 0; round < 20; round++) {
      dealAgain(room);
      expect(seatOrder(room).toSorted()).toEqual(names);
      expect(room.seats.some((seat) => seat.id === room.dealerId)).toBe(true);
      expect(room.game?.players).toHaveLength(room.seats.length);
    }
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

    // The arrow that would do this is disabled; a tap that arrives anyway means the
    // table moved, and that is not worth an error banner.
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

    // Which rooms are worth *offering* this in is the lobby's call. Refusing it here
    // would throw at a host who flipped an unrelated setting mid-shuffle.
    moveSeat(room, room.hostId, room.seats[1]?.id ?? "", "up");
    expect(seatOrder(room)[0]).toBe("Robot");
  });

  it("passes the deal round the new order", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    expect(room.dealerId).toBe(room.seats[0]?.id);

    // The deal follows the seat list, so a table rearranged between games rotates
    // round the order it is now actually sitting in.
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

  // Unlike bot speed, which is read live. These are read once, at the deal (#134).
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

describe("playing with the highlights on", () => {
  it("is off until a browser says otherwise", () => {
    const room = seatedRoom();
    expect(roomView(room).seats.every((seat) => !seat.hinted)).toBe(true);
  });

  it("is the seat's own to set, host or not", () => {
    const room = seatedRoom();
    const guest = room.seats[1]?.id ?? "";

    // No `requireHost` anywhere near it: it changes one screen and nothing
    // about the room.
    expect(setHints(room, guest, true)).toBe(true);
    expect(roomView(room).seats.find((seat) => seat.id === guest)?.hinted).toBe(true);
  });

  it("can be changed with a game already running", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    const before = JSON.stringify(room.game);

    // The point of #187 is that it is a thing you decide rather than one that
    // expires, and mid-hand is when somebody works out they want it.
    expect(setHints(room, room.hostId, true)).toBe(true);
    expect(roomView(room).seats[0]?.hinted).toBe(true);
    // And the engine never learns it happened.
    expect(JSON.stringify(room.game)).toBe(before);
  });

  it("only announces the change that turns it on", () => {
    const room = seatedRoom();

    expect(setHints(room, room.hostId, true)).toBe(true);
    // A browser re-asserting its own preference on reconnect says nothing.
    expect(setHints(room, room.hostId, true)).toBe(false);
    // And giving up an advantage is nobody else's business.
    expect(setHints(room, room.hostId, false)).toBe(false);
    expect(setHints(room, room.hostId, true)).toBe(true);
  });

  it("refuses a seat that is not at this table", () => {
    const room = seatedRoom();
    expect(() => setHints(room, "somebody-else", true)).toThrow(/not at this table/);
  });

  it("marks one seat and no others", () => {
    const room = seatedRoom(4);
    const guest = room.seats[2]?.id ?? "";
    setHints(room, guest, true);

    const marked = roomView(room).seats.filter((seat) => seat.hinted);
    expect(marked.map((seat) => seat.id)).toEqual([guest]);
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

    // The window lasts seconds and the schedule is worked out afresh on every
    // broadcast. Re-rolling here would walk 70% up to a certainty.
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

/**
 * The other hold (#356). A judged Sunny call is the one moment the whole table
 * watches, and until now the bots played straight through it — #209's note about
 * the reshuffle applied to a moment with a different requirement. A reshuffle is
 * scenery; a ruling is the table being told what just happened, and cards moving
 * underneath it are both a distraction and how the live top card came to
 * disagree with the evidence drawn over it.
 */
describe("holding the table while a ruling is watched", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds nothing while nothing has been judged", () => {
    const room = seatedRoom();
    botDrawsWithAPlay(room);
    expect(rulingHeldUntil(room)).toBe(0);
  });

  it("holds for the length of the beat both screens draw", () => {
    vi.useFakeTimers();
    const room = seatedRoom();
    callLands(room, 5000);
    expect(rulingHeldUntil(room, 5000)).toBe(5000 + RULING_HOLD_MS);
  });

  it("lets go on its own, and prunes as it is read", () => {
    vi.useFakeTimers();
    const room = seatedRoom();
    callLands(room, 5000);

    expect(rulingHeldUntil(room, 5000 + RULING_HOLD_MS - 1)).toBeGreaterThan(0);
    expect(rulingHeldUntil(room, 5000 + RULING_HOLD_MS)).toBe(0);
    expect(room.ruling).toBe(0);
  });

  it("holds a call that missed for exactly as long", () => {
    // A wrong call peels and rules identically to a right one, at the same speed
    // for the same length of time — a shorter hold would be the tell #50 removed
    // arriving as pacing.
    vi.useFakeTimers();
    const room = seatedRoom();
    const drawer = botDrawsWithAPlay(room);
    const game = room.game;
    if (!game) throw new Error("no game");
    const wrong = game.challenge?.reach.hand.find(
      (miss) => !isPlayable(miss, game.challenge!.reach.activeSuit, game.challenge!.reach.topRank),
    );
    if (!wrong) throw new Error("nothing illegal to name");

    vi.setSystemTime(5000);
    const outcome = applySeatIntent(room, room.hostId, {
      type: "callSunny",
      playerId: room.hostId,
      cardId: wrong.id,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.events.find((event) => event.type === "sunnyCalled")?.correct).toBe(false);
    expect(drawer).not.toBe(room.hostId);
    expect(rulingHeldUntil(room, 5000)).toBe(5000 + RULING_HOLD_MS);
  });
});

/**
 * The third hold (#383), and #209's note about the reshuffle reversed rather
 * than sidestepped. The deck running out is given about five seconds to be
 * noticed in, and the bots played straight through all of it — at lightning
 * speed up to seven moves landing during a hold that exists so people can see
 * *one* thing happen. If it is worth 4.8 seconds of everybody's time it is worth
 * not talking over.
 *
 * Still presentation: no engine change, no new event, `DEFAULT_BOT_TIMING`
 * untouched. Bots are all that stops.
 */
describe("holding the table while the deck is shuffled back", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds nothing while the deck still has cards in it", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    expect(reshuffleHeldUntil(room)).toBe(0);
  });

  it("holds for the length of the animation all three screens draw", () => {
    vi.useFakeTimers();
    const room = seatedRoom();
    deckRunsOut(room, 5000);
    expect(reshuffleHeldUntil(room, 5000)).toBe(5000 + RESHUFFLE_HOLD_MS);
  });

  it("lets go on its own, and prunes as it is read", () => {
    vi.useFakeTimers();
    const room = seatedRoom();
    deckRunsOut(room, 5000);

    expect(reshuffleHeldUntil(room, 5000 + RESHUFFLE_HOLD_MS - 1)).toBeGreaterThan(0);
    expect(reshuffleHeldUntil(room, 5000 + RESHUFFLE_HOLD_MS)).toBe(0);
    expect(room.reshuffle).toBe(0);
  });

  it("never shortens a ruling already being watched", () => {
    // `finishSunny` can rewind a recycle and rule on the call in one outcome, and
    // the peel goes first, always (#209). Two deadlines rather than one field
    // they take turns writing is what makes that fall out of `Math.max`.
    vi.useFakeTimers();
    const room = seatedRoom();
    callLands(room, 5000);
    room.reshuffle = 5000 + RESHUFFLE_HOLD_MS;

    expect(Math.max(rulingHeldUntil(room, 5000), reshuffleHeldUntil(room, 5000))).toBe(
      5000 + RULING_HOLD_MS,
    );
    expect(room.ruling).toBe(5000 + RULING_HOLD_MS);
  });

  it("leaves the draw pile alone, because a hold is on bots and nothing else", () => {
    // #209 names this exact five seconds as a tempting place to put a guard rail.
    // A person's tap is never swallowed because the deck is being shuffled.
    vi.useFakeTimers();
    const room = seatedRoom();
    deckRunsOut(room, 5000);

    const game = room.game;
    if (!game) throw new Error("no game");
    const reaching = game.players[game.turnIndex];
    if (!reaching) throw new Error("nobody to draw");
    expect(applySeatIntent(room, reaching.id, { type: "drawCard", playerId: reaching.id }).ok).toBe(
      true,
    );
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
    game.sunnyLockouts[room.hostId] = game.totalReaches + 3;

    holdCall(room, room.hostId, true, 1000);
    expect(callHeldUntil(room, 1000)).toBe(0);
  });
});

/**
 * A seat somebody has handed over for a while (#202).
 *
 * The properties worth holding are all about what it *won't* do: it cannot
 * commit a Sunny violation nobody chose, it never accuses, and forced-only means
 * genuinely forced.
 */
describe("a seat on autopilot", () => {
  /**
   * The host on the clock, holding exactly these cards, against exactly this
   * card in play. Dealt hands are random and every assertion below is about a
   * *count* of legal cards, which is the one thing a random hand won't hold
   * still.
   */
  const stageHostTurn = (room: Room, hand: string[], top: string) => {
    beginGame(room, room.hostId);
    const game = room.game;
    if (!game) throw new Error("no game");
    game.turnIndex = game.players.findIndex((player) => player.id === room.hostId);
    const player = game.players[game.turnIndex];
    if (!player) throw new Error("no player");

    player.hand = hand.map((spec, index) => card(spec, index + 1));
    game.discardPile[game.discardPile.length - 1] = card(top);
    game.activeSuit = card(top).suit;
    game.drawsThisTurn = 0;
    return game;
  };


  it("is off until the player says otherwise, and goes out to the whole table", () => {
    const room = seatedRoom();
    expect(roomView(room).seats.every((seat) => seat.autopilot === "off")).toBe(true);

    setAutopilot(room, room.hostId, "forced");
    expect(roomView(room).seats[0]?.autopilot).toBe("forced");
  });

  it("is nobody else's to set", () => {
    const room = seatedRoom();
    // The only handle is the caller's own id, which the socket stamps from the
    // connection — so there is nothing here another player could reach.
    expect(() => setAutopilot(room, "somebody-else", "bot")).toThrow(/not at this table/);
    expect(() => setAutopilot(room, room.hostId, "sideways" as never)).toThrow(/No such autopilot/);
  });

  it("refuses a bot, which already plays itself", () => {
    const room = seatedRoom();
    const bot = room.seats.find((seat) => seat.bot);
    expect(() => setAutopilot(room, bot?.id ?? "", "bot")).toThrow(/already plays itself/);
  });

  it("moves a seat the table would otherwise be waiting on", () => {
    const room = seatedRoom();
    stageHostTurn(room, ["7H", "2D"], "7S");

    // Nothing moves this seat while it is a person's.
    expect(nextBotMove(room)?.seat.id).not.toBe(room.hostId);
    setAutopilot(room, room.hostId, "bot");
    expect(nextBotMove(room)?.seat.id).toBe(room.hostId);
  });

  it("never draws while holding a play, in either mode", () => {
    // The single most important property of the feature, and it comes free from
    // playing whenever it can: an autopiloted seat can never commit the
    // violation the Sunny Rule exists to punish.
    for (const mode of ["forced", "bot"] as const) {
      const room = seatedRoom();
      stageHostTurn(room, ["7H", "2D"], "7S");

      setAutopilot(room, room.hostId, mode);
      const move = nextBotMove(room);
      expect(move?.seat.id).toBe(room.hostId);
      expect(move?.intent.type).toBe("playCard");
    }
  });

  it("waits for the player on a real choice, and only in forced-only", () => {
    const room = seatedRoom();
    // Two playable cards is a decision, which is the whole of what forced-only
    // hands back.
    stageHostTurn(room, ["7H", "7D"], "7S");

    setAutopilot(room, room.hostId, "forced");
    expect(nextBotMove(room)).toBeNull();

    setAutopilot(room, room.hostId, "bot");
    expect(nextBotMove(room)?.seat.id).toBe(room.hostId);
  });

  it("draws in forced-only when nothing matches, because that is not a choice", () => {
    const room = seatedRoom();
    stageHostTurn(room, ["2D", "3D"], "7S");

    setAutopilot(room, room.hostId, "forced");
    const move = nextBotMove(room);
    expect(move?.seat.id).toBe(room.hostId);
    expect(move?.intent.type).toBe("drawCard");
  });

  it("names no suit and picks no punishment card in forced-only", () => {
    const room = seatedRoom();
    const game = stageHostTurn(room, ["2D", "3D"], "7S");
    setAutopilot(room, room.hostId, "forced");

    // Which suit to call is a choice, and under Power of Eights an important one.
    game.phase = { kind: "suit", playerId: room.hostId };
    expect(nextBotMove(room)).toBeNull();

    // And which card to lose is a choice about which card to lose.
    game.phase = { kind: "surrender", playerId: room.hostId, reason: "sunnyPunishment" };
    expect(nextBotMove(room)).toBeNull();
  });

  it("never calls the Sunny Rule, however watchful the table is", () => {
    const room = seatedRoom();
    room.botSeed = seedRolling(true);
    const bot = botDrawsWithAPlay(room);
    setAutopilot(room, room.hostId, "bot");

    // The bot is caught and the table has agreed to call. Every call that comes
    // out is a bot's; the autopiloted seat plays its hand and accuses nobody.
    for (let move = nextBotMove(room); move; move = nextBotMove(room)) {
      if (move.intent.type !== "callSunny") break;
      expect(move.seat.id).not.toBe(room.hostId);
      const outcome = applySeatIntent(room, move.seat.id, move.intent);
      expect(outcome.ok).toBe(true);
    }
    expect(bot).not.toBe(room.hostId);
  });

  it("switches itself off when the game ends", () => {
    const room = seatedRoom();
    beginGame(room, room.hostId);
    setAutopilot(room, room.hostId, "bot");

    // Play it out. A new deal is a new hand, and coming back to find you had
    // been playing on autopilot for three games is not what anybody asked for.
    for (let guard = 0; guard < 2000 && room.game?.status === "playing"; guard += 1) {
      const move = nextBotMove(room);
      if (!move) break;
      applySeatIntent(room, move.seat.id, move.intent);
    }

    expect(room.game?.status).toBe("over");
    expect(hostSeat(room)?.autopilot).toBe("off");
  });
});

/**
 * Leaving, as opposed to a socket dropping (#256).
 *
 * These invariants are `simulation.test.ts`'s — cards conserved, exactly one
 * winner — and they are checked here rather than there because **the engine has
 * nothing to leave**. A seat is a `rooms.ts` idea; `packages/engine` knows only
 * players, and leaving is deliberately not something it learns about. Running
 * the invariants over a room is the honest version of that acceptance criterion.
 */
describe("a player leaving mid-game", () => {
  /** Plays the table out with whatever the bots and autopilots decide. */
  const playOut = (room: Room): void => {
    for (let guard = 0; guard < 4000 && room.game?.status === "playing"; guard += 1) {
      const move = nextBotMove(room);
      if (!move) break;
      applySeatIntent(room, move.seat.id, move.intent);
      expect(cardsInPlay(room)).toBe(52);
    }
  };

  it("does not stop the table, and the hand still ends with one winner", () => {
    const room = seatedRoom(4);
    beginGame(room, room.hostId);
    expect(cardsInPlay(room)).toBe(52);

    // Before this existed the turn reached this seat and stayed there forever:
    // `nextBotMove` drove `seat.bot` and nothing else, so a human seat was moved
    // by messages from that human's socket and by nothing at all otherwise.
    leaveSeat(room, room.hostId);
    playOut(room);

    expect(room.game?.status).toBe("over");
    expect(room.game?.winnerId).not.toBeNull();
    expect(cardsInPlay(room)).toBe(52);
  });

  it("keeps their cards in play rather than deleting the seat", () => {
    const room = seatedRoom(4);
    const gone = room.hostId;
    beginGame(room, gone);
    const seats = room.seats.length;

    leaveSeat(room, gone);

    // A seat with a hand in it is not deletable — card conservation is the first
    // invariant this game has. It goes at the next deal instead.
    expect(room.seats.length).toBe(seats);
    expect(room.seats.find((seat) => seat.id === gone)?.left).toBe(true);
    expect(cardsInPlay(room)).toBe(52);
  });

  it("hands the seat to the autopilot rather than to forced-only", () => {
    const room = seatedRoom(4);
    const who = room.seats[1]?.id ?? "";
    beginGame(room, room.hostId);
    leaveSeat(room, who);

    // Nobody is coming back to make the choices, and forced-only stalls on any
    // real one.
    const seat = room.seats.find((candidate) => candidate.id === who);
    expect(seat?.left).toBe(true);
    expect(seat?.autopilot).toBe("bot");
    expect(seat?.connected).toBe(false);
  });

  it("is not recoverable, where a dropped connection still is", () => {
    const store = createStore();
    const { room, seat } = createRoom(store, "Ryan");
    while (room.seats.length < MIN_TABLE_PLAYERS) addBot(room, room.hostId);
    beginGame(room, room.hostId);

    // A lock screen, a backgrounded tab and a dropped tunnel are all one thing.
    markDisconnected(room, seat.id);
    expect(() => rejoinRoom(store, room.code, seat.id, seat.token)).not.toThrow();

    // A leave is deliberate, and the browser has already thrown its token away.
    const token = seat.token;
    leaveSeat(room, seat.id);
    expect(() => rejoinRoom(store, room.code, seat.id, token)).toThrow(/isn't yours any more/);
  });

  it("lets the host deal again, without the seat that left", () => {
    const store = createStore();
    const { room } = createRoom(store, "Ryan");
    const { seat: guest } = joinRoom(store, room.code, "Ana");
    // One over the minimum, so the table is still dealable once Ana has gone.
    while (room.seats.length <= MIN_TABLE_PLAYERS) addBot(room, room.hostId);
    beginGame(room, room.hostId);

    leaveSeat(room, guest.id);
    // The hand ends however it ends — the point here is what the *next* deal
    // does. `playOut` cannot finish it: Ryan is still a person, and a person's
    // seat is moved by messages from their socket and by nothing else.
    if (room.game) room.game.status = "over";

    // "That game is already under way" was the other half of the stall: with the
    // turn parked forever, the host could not start a new one either.
    expect(() => beginGame(room, room.hostId)).not.toThrow();
    expect(room.seats.some((seat) => seat.id === guest.id)).toBe(false);
    expect(room.seats.every((seat) => !seat.left)).toBe(true);
  });

  it("takes the seat straight out between games", () => {
    const room = seatedRoom(4);
    const gone = room.seats[1]?.id ?? "";

    // No cards to conserve, so there is nothing to keep the seat for.
    expect(leaveSeat(room, gone).map((event) => event.type)).toEqual(["left"]);
    expect(room.seats.some((seat) => seat.id === gone)).toBe(false);
  });

  it("moves the host's powers on so somebody can still deal", () => {
    const store = createStore();
    const { room } = createRoom(store, "Ryan");
    const { seat: guest } = joinRoom(store, room.code, "Ana");
    while (room.seats.length < MIN_TABLE_PLAYERS) addBot(room, room.hostId);

    leaveSeat(room, room.hostId);
    expect(room.hostId).toBe(guest.id);
  });
});

/**
 * Reordering the table from the shared screen (#201).
 *
 * The same operation as the lobby's arrows, gated the way the shared-screen draw
 * is: the `table` bit is the client's own word for what it is, so what holds the
 * line is `irl` — checked here — and between-games, which it shares with
 * `moveSeat`.
 */
describe("moving a seat from the shared table screen", () => {
  const irlRoom = (): Room => {
    const room = seatedRoom();
    setIrl(room, room.hostId, true);
    return room;
  };

  it("reorders the table, without a host", () => {
    const room = irlRoom();
    const before = seatOrder(room);
    const second = room.seats[1]?.id ?? "";

    moveSeatFromTable(room, second, "up");
    expect(seatOrder(room)).toEqual([before[1], before[0], before[2], before[3]]);
  });

  it("matches what the same move produces from the lobby's arrows", () => {
    const byArrow = irlRoom();
    const byDrag = irlRoom();
    // Same table, same seed of names — `seatedRoom` builds them identically.
    expect(seatOrder(byArrow)).toEqual(seatOrder(byDrag));

    const arrowTarget = byArrow.seats[2]?.id ?? "";
    const dragTarget = byDrag.seats[2]?.id ?? "";
    moveSeat(byArrow, byArrow.hostId, arrowTarget, "up");
    moveSeatFromTable(byDrag, dragTarget, "up");

    expect(seatOrder(byDrag)).toEqual(seatOrder(byArrow));
  });

  it("refuses an online room outright", () => {
    const room = seatedRoom();
    expect(room.irl).toBe(false);
    // Strangers, and none of them get to reorder a stranger's table.
    expect(() => moveSeatFromTable(room, room.seats[1]?.id ?? "", "up")).toThrow(/only watch/);
  });

  it("refuses while a hand is out", () => {
    const room = irlRoom();
    beginGame(room, room.hostId);
    expect(() => moveSeatFromTable(room, room.seats[1]?.id ?? "", "up")).toThrow(
      /Wait for this game to finish/,
    );
  });

  it("does nothing off either end, rather than refusing", () => {
    const room = irlRoom();
    const before = seatOrder(room);
    // The same answer the arrows get: the table may have moved under somebody's
    // thumb, and an error is no help.
    moveSeatFromTable(room, room.seats[0]?.id ?? "", "up");
    moveSeatFromTable(room, room.seats[room.seats.length - 1]?.id ?? "", "down");
    expect(seatOrder(room)).toEqual(before);
  });
});

/**
 * Where a seat is sitting, and what that has to leave alone (#320). Position on
 * the shared screen's board *is* seat order, so a spot is a place in the turn
 * order — which makes the interesting cases the ones where nothing should move.
 */
const spotsOf = (room: Room): number[] => room.seats.map((seat) => seat.spot);

describe("where the seats are sitting", () => {
  it("seats people in the order they sat down, evenly round the table", () => {
    // The property that matters most, because it is the one an online room —
    // which never sees a board at all — would otherwise lose: adding four bots
    // must put them in the order they were added.
    const room = seatedRoom();
    expect(seatOrder(room)).toEqual(["Ryan", "Robot", "Clockwork", "Tinny"]);
    expect(spotsOf(room)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("re-spaces as a table fills, while nobody has arranged it", () => {
    const room = seatedRoom();
    addBot(room, room.hostId);
    expect(seatOrder(room)).toEqual(["Ryan", "Robot", "Clockwork", "Tinny", "Gizmo"]);
    for (const [index, at] of spotsOf(room).entries()) expect(at).toBeCloseTo(index / 5, 9);
  });

  it("moves a seat by trading chairs, so the order follows the board", () => {
    const room = seatedRoom();
    const before = spotsOf(room);
    moveSeat(room, room.hostId, room.seats[1]?.id ?? "", "up");
    expect(seatOrder(room)[0]).toBe("Robot");
    // The pair swapped where they sit; nobody else moved, and the chairs are the
    // same chairs.
    expect(spotsOf(room)).toEqual(before);
  });

  it("puts a seat where it was dropped, and leaves everybody else alone", () => {
    const room = seatedRoom();
    setIrl(room, room.hostId, true);
    const moved = room.seats[3]?.id ?? "";
    const others = room.seats.filter((seat) => seat.id !== moved).map((seat) => seat.spot);

    // Dropped between the first and second seats, which is where it now plays.
    placeSeat(room, moved, 0.1);
    expect(room.seats[1]?.id).toBe(moved);
    expect(room.seats[1]?.spot).toBeCloseTo(0.1, 9);
    expect(room.seats.filter((seat) => seat.id !== moved).map((seat) => seat.spot)).toEqual(others);
  });

  it("stops re-spacing once a table has arranged itself", () => {
    const room = seatedRoom();
    setIrl(room, room.hostId, true);
    placeSeat(room, room.seats[3]?.id ?? "", 0.1);
    const arranged = spotsOf(room);

    // A newcomer takes the free chair rather than sending everybody round the
    // table again.
    addBot(room, room.hostId);
    expect(spotsOf(room)).toEqual(expect.arrayContaining(arranged));
    expect(room.seats).toHaveLength(5);
  });

  it("is an IRL room's to place, and only between games", () => {
    const online = seatedRoom();
    expect(() => placeSeat(online, online.seats[1]?.id ?? "", 0.4)).toThrow(/only watch/);

    const room = seatedRoom();
    setIrl(room, room.hostId, true);
    beginGame(room, room.hostId);
    expect(() => placeSeat(room, room.seats[1]?.id ?? "", 0.4)).toThrow(/Wait for this game/);
  });

  it("refuses a seat that isn't at this table, and a spot that isn't a number", () => {
    const room = seatedRoom();
    setIrl(room, room.hostId, true);
    expect(() => placeSeat(room, "someone-who-left", 0.4)).toThrow(/Nobody by that id/);
    expect(() => placeSeat(room, room.seats[1]?.id ?? "", "half" as unknown as number)).toThrow(
      /sits somewhere/,
    );
  });

  it("never seats two people in the same chair", () => {
    // Two seats on one point have no order between them, which would be a turn
    // order that depended on a sort's stability.
    const room = seatedRoom();
    setIrl(room, room.hostId, true);
    placeSeat(room, room.seats[2]?.id ?? "", 0.25);
    const spots = spotsOf(room);
    expect(new Set(spots).size).toBe(spots.length);
    for (let i = 1; i < spots.length; i += 1) expect(spots[i]!).toBeGreaterThan(spots[i - 1]!);
  });

  it("shuffles the players across the chairs rather than the chairs themselves", () => {
    // #199 says the chairs stay where they are and who sits in them changes,
    // which is what the "take your seat" screen is already telling everybody.
    const room = seatedRoom();
    setIrl(room, room.hostId, true);
    placeSeat(room, room.seats[3]?.id ?? "", 0.1);
    const chairs = spotsOf(room);

    setShuffleSeats(room, room.hostId, true);
    beginGame(room, room.hostId);
    expect(spotsOf(room)).toEqual(chairs);
    expect(room.seats).toHaveLength(chairs.length);
  });
});
