/**
 * How fast the bots go.
 *
 * Not a rule, but the thing a table notices most: a bot that answers instantly
 * is unpleasant to sit next to, and one that sits on a decision it has already
 * made just reads as lag.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_BOT_TIMING, botPace, type BotMoveShape } from "../src/socket.ts";

const ordinary: BotMoveShape = { call: false, closesWindow: false, midTurn: false };

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

  it("holds off on anything that would shut a challenge window", () => {
    for (const timing of Object.values(DEFAULT_BOT_TIMING)) {
      const closing = botPace(timing, { ...ordinary, closesWindow: true });
      expect(closing).toBe(timing.sunnyGrace);
      // Whatever the pace, shutting the window is the slowest thing a bot does.
      expect(closing).toBeGreaterThan(botPace(timing, ordinary));
      expect(closing).toBeGreaterThan(botPace(timing, { ...ordinary, midTurn: true }));
    }
  });

  it("leaves a person long enough to read a hand and name a card", () => {
    // Nothing on screen says whether a draw was illegal, so a call at human
    // speed is three decisions from a standing start: notice the reach, read
    // the hand they reached from, pick the card they should have played. A
    // window a bot can shut inside ten seconds is not one a person can use.
    expect(DEFAULT_BOT_TIMING.human.sunnyGrace).toBeGreaterThan(10_000);
  });

  it("takes a call ahead of everything, however mid-turn it is", () => {
    for (const timing of Object.values(DEFAULT_BOT_TIMING)) {
      const calling: BotMoveShape = { call: true, closesWindow: true, midTurn: true };
      expect(botPace(timing, calling)).toBe(timing.call);
    }
  });
});
