/**
 * How fast the bots go.
 *
 * Not a rule, but the thing a table notices most: a bot that answers instantly
 * is unpleasant to sit next to, and one that sits on a decision it has already
 * made just reads as lag.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_BOT_TIMING, botPace, type BotMoveShape } from "../src/socket.ts";

const ordinary: BotMoveShape = { call: false, midTurn: false };

describe("a bot's pace", () => {
  it("pauses to think once a turn, then gets on with it", () => {
    const human = DEFAULT_BOT_TIMING.human;
    expect(botPace(human, ordinary)).toBe(3000);
    expect(botPace(human, { ...ordinary, midTurn: true })).toBe(1000);
    expect(botPace(human, { ...ordinary, midTurn: true })).toBeLessThan(
      botPace(human, ordinary),
    );
  });

  it("is flat out in lightning, and still slower than a card crossing the table", () => {
    const lightning = DEFAULT_BOT_TIMING.lightning;
    expect(botPace(lightning, ordinary)).toBe(700);
    expect(botPace(lightning, { ...ordinary, midTurn: true })).toBe(700);
    // `FLIGHT_MS` in the web package is 220ms. Moving faster than the card
    // would leave the table narrating a queue it has already left behind.
    expect(botPace(lightning, ordinary)).toBeGreaterThan(220);
  });

  it("keeps its rhythm whether or not a challenge window is open", () => {
    // A window opens on every draw, so a bot that waited on one would spend
    // most of the game waiting. Nothing about a Sunny call being available to
    // somebody else — including a call against the bot that just drew — reaches
    // this function. There is no input here that could carry it.
    for (const timing of Object.values(DEFAULT_BOT_TIMING)) {
      expect(botPace(timing, ordinary)).toBe(timing.firstMove);
      expect(botPace(timing, { ...ordinary, midTurn: true })).toBe(timing.nextMove);
    }
  });

  it("takes a call ahead of everything, however mid-turn it is", () => {
    for (const timing of Object.values(DEFAULT_BOT_TIMING)) {
      const calling: BotMoveShape = { call: true, midTurn: true };
      expect(botPace(timing, calling)).toBe(timing.call);
    }
  });

  it("leaves a person room to beat the bots to a call at human speed", () => {
    // The one Sunny figure left. It paces a call a bot is making, not a wait on
    // one it might be given — and it is long because bots that call correctly
    // would otherwise take every call at the table.
    const human = DEFAULT_BOT_TIMING.human;
    expect(botPace(human, { ...ordinary, call: true })).toBeGreaterThan(
      botPace(human, ordinary),
    );
  });
});
