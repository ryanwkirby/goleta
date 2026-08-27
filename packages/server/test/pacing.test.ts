/**
 * How fast the bots go.
 *
 * Not a rule, but the thing a table notices most: a bot that answers instantly
 * is unpleasant to sit next to, and one that sits on a decision it has already
 * made just reads as lag.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { RESHUFFLE_HOLD_MS, RULING_HOLD_MS } from "../src/rooms.ts";
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
    // A window opens on every draw, so a bot that waited on one would spend most of
    // the game waiting. There is no input here that could carry it.
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
    // The one Sunny figure left: it paces a call a bot is making, not a wait on one
    // it might be given, and it is long because bots that call correctly would
    // otherwise take every call at the table.
    const human = DEFAULT_BOT_TIMING.human;
    expect(botPace(human, { ...ordinary, call: true })).toBeGreaterThan(
      botPace(human, ordinary),
    );
  });
});

/**
 * `RULING_HOLD_MS` is `PEEL_MS + ANNOUNCE_MS` written out a second time, on the
 * far side of a boundary the server may not import across: the browser bundle is
 * not the server's to reach into, and `packages/engine` is rules — a beat is
 * neither (#356). `RESHUFFLE_HOLD_MS` is `RESHUFFLE_MS` the same way (#383).
 *
 * So the duplication is paid for here rather than assumed. The figures are read
 * out of `beats.ts` as text, which is crude and is the point: change one and this
 * fails, loudly, in the package that would otherwise let bots move under the tail
 * of an announcement nobody had finished watching.
 */
const beats = (): Record<string, number> => {
  const source = readFileSync(resolve(import.meta.dirname, "../../web/src/lib/beats.ts"), "utf8");
  const found: Record<string, number> = {};
  for (const [, name, value] of source.matchAll(/export const (\w+) = (\d+);/g)) {
    found[name as string] = Number(value);
  }
  return found;
};

describe("the hold on a judged ruling", () => {
  it("is exactly as long as the beat both screens draw", () => {
    const { PEEL_MS, ANNOUNCE_MS } = beats();
    expect(PEEL_MS).toBeGreaterThan(0);
    expect(ANNOUNCE_MS).toBeGreaterThan(0);
    expect(RULING_HOLD_MS).toBe((PEEL_MS ?? 0) + (ANNOUNCE_MS ?? 0));
  });
});

describe("the hold on the deck running out", () => {
  it("is exactly as long as the animation all three screens draw", () => {
    const { RESHUFFLE_MS } = beats();
    expect(RESHUFFLE_MS).toBeGreaterThan(0);
    expect(RESHUFFLE_HOLD_MS).toBe(RESHUFFLE_MS);
  });

  it("is shorter than the ruling, which is the order the two go in", () => {
    // Not a rule the code enforces — `Math.max` takes the later deadline
    // whichever it is — but a recycle that outlasted a ruling would mean a beat
    // #209 says queues behind the peel outliving the peel itself.
    expect(RESHUFFLE_HOLD_MS).toBeLessThan(RULING_HOLD_MS);
  });
});
