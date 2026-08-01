/**
 * Room bookkeeping that sits between the lobby and the engine — the things a
 * browser can reach but that aren't rules. The wire is covered separately in
 * `integration.test.ts`; this is the store itself.
 */

import { describe, expect, it } from "vitest";

import { MAX_TABLE_PLAYERS, MIN_TABLE_PLAYERS } from "@goleta/engine";

import { addBot, beginGame, createRoom, createStore, type Room } from "../src/rooms.ts";

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
