/**
 * What a bot will and won't say about a draw.
 *
 * The rules of the call itself live in `sunny.test.ts`; this is about judgment.
 * A bot accuses only somebody it has caught, and whether a caught player is
 * called at all is one decision taken by the table, not one per bot.
 */

import { describe, expect, it } from "vitest";

import {
  SUNNY_CALL_CHANCE,
  decideBotIntent,
  redact,
  rollSunnyCall,
  type GameState,
} from "../src/index.ts";
import { draw, table } from "./helpers.ts";

/** `a` is holding a playable 5H and reaches for the deck anyway. */
const illegalDraw = (): GameState =>
  draw(
    table({
      hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] },
      top: "5S",
      drawPile: ["QD", "KD"],
    }),
    "a",
  );

/** The same reach, from a hand with nothing in it that matches. */
const honestDraw = (): GameState =>
  draw(
    table({
      hands: { a: ["2C", "3C"], b: ["9H"], c: ["4D"] },
      top: "5S",
      drawPile: ["QD", "KD"],
    }),
    "a",
  );

describe("a bot with a call on offer", () => {
  it("makes it, once the table has agreed to", () => {
    const view = redact(illegalDraw(), "b");
    expect(view.sunnyWouldLand).toBe(true);
    expect(decideBotIntent(view, { callSunny: true })).toEqual({
      type: "callSunny",
      playerId: "b",
    });
  });

  it("keeps quiet when the table decided to let it go", () => {
    const view = redact(illegalDraw(), "b");
    expect(decideBotIntent(view, { callSunny: false })?.type).not.toBe("callSunny");
  });

  it("never accuses an honest draw, however keen the table is", () => {
    const view = redact(honestDraw(), "b");
    // The button is there — it is there after every draw — and the bot leaves
    // it alone, because nothing behind it says the draw was illegal.
    expect(view.sunnyCallable).toBe(true);
    expect(view.sunnyWouldLand).toBe(false);
    expect(decideBotIntent(view, { callSunny: true })?.type).not.toBe("callSunny");
  });

  it("never accuses the player who drew, which is itself", () => {
    const view = redact(illegalDraw(), "a");
    expect(view.sunnyCallable).toBe(false);
    expect(decideBotIntent(view, { callSunny: true })?.type).not.toBe("callSunny");
  });
});

describe("the table's roll", () => {
  it("lands near the chance it advertises", () => {
    const runs = 20_000;
    let seed = 1;
    let called = 0;
    for (let run = 0; run < runs; run += 1) {
      const [call, next] = rollSunnyCall(seed);
      seed = next;
      if (call) called += 1;
    }
    const rate = (called / runs) * 100;
    expect(rate).toBeGreaterThan(SUNNY_CALL_CHANCE - 3);
    expect(rate).toBeLessThan(SUNNY_CALL_CHANCE + 3);
  });

  it("gives the same answer to the same seed, so a table replays", () => {
    expect(rollSunnyCall(20260801)).toEqual(rollSunnyCall(20260801));
  });
});
