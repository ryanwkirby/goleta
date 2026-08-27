/**
 * What a bot will and won't say about a draw, and how far ahead it looks when it
 * plays. The rules of the call itself live in `sunny.test.ts`.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPTIONS,
  SUNNY_CALL_CHANCE,
  decideBotIntent,
  redact,
  rollSunnyCall,
  type GameState,
} from "../src/index.ts";
import { card, draw, must, play, table } from "./helpers.ts";

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
  it("makes it, once the table has agreed to, naming the card it caught them holding", () => {
    const view = redact(illegalDraw(), "b");
    expect(view.sunnyReach?.hand.map((c) => c.id)).toEqual(["5H#1", "2C#1"]);
    expect(decideBotIntent(view, { callSunny: true })).toEqual({
      type: "callSunny",
      playerId: "b",
      cardId: "5H#1",
    });
  });

  it("keeps quiet when the table decided to let it go", () => {
    const view = redact(illegalDraw(), "b");
    expect(decideBotIntent(view, { callSunny: false })?.type).not.toBe("callSunny");
  });

  it("never accuses an honest draw, however keen the table is", () => {
    const view = redact(honestDraw(), "b");
    // The button is there after every draw, and the bot leaves it alone because
    // working the reach out finds nothing legal in it.
    expect(view.sunnyCallable).toBe(true);
    expect(view.sunnyReach?.hand.map((c) => c.id)).toEqual(["2C#1", "3C#1"]);
    expect(decideBotIntent(view, { callSunny: true })?.type).not.toBe("callSunny");
  });

  it("never accuses the player who drew, which is itself", () => {
    const view = redact(illegalDraw(), "a");
    expect(view.sunnyCallable).toBe(false);
    expect(decideBotIntent(view, { callSunny: true })?.type).not.toBe("callSunny");
  });
});

/**
 * `a` must play on a 5S holding 9S and 5D, which leave very different boards
 * behind. Nothing in `a`'s own hand separates them, so the old rule kept them in
 * hand order and played the 9S.
 */
const choiceOfTwo = (next: string[]): GameState =>
  table({
    hands: { a: ["9S", "5D"], b: next, c: ["7C"] },
    top: "5S",
    drawPile: ["QD", "KD"],
  });

describe("a bot choosing which card to play", () => {
  it("leaves the next player a card they have to answer", () => {
    // KD follows the 5D, by suit. It follows nothing about the 9S.
    const view = redact(choiceOfTwo(["KD"]), "a");
    expect(decideBotIntent(view)).toEqual({ type: "playCard", playerId: "a", cardId: "5D#1" });
  });

  it("falls back to shedding its own scarcest suit when neither card corners them", () => {
    // 2C answers neither, so both plays strand them and the old rule decides.
    const view = redact(choiceOfTwo(["2C"]), "a");
    expect(decideBotIntent(view)).toEqual({ type: "playCard", playerId: "a", cardId: "9S#1" });
  });

  it("and when an 8 next door means every card corners them alike", () => {
    // A wild follows anything, so there is nothing to choose between the two.
    const view = redact(choiceOfTwo(["8C"]), "a");
    expect(decideBotIntent(view)).toEqual({ type: "playCard", playerId: "a", cardId: "9S#1" });
  });

  it("reads the seat that actually plays next, not the one sitting next to it", () => {
    const state = table({
      hands: { a: ["9S", "5D"], b: ["KD"], c: ["7S"] },
      top: "5S",
      drawPile: ["QD", "KD#2"],
      out: ["b"],
    });
    // `b` is holding the diamond and is out of the game. `c` answers the 9S.
    expect(decideBotIntent(redact(state, "a"))).toEqual({
      type: "playCard",
      playerId: "a",
      cardId: "9S#1",
    });
  });

  it("stops reading the next seat for the play it owes a landed call", () => {
    const caught = must(
      draw(
        table({
          hands: { a: ["9S", "5D", "2C"], b: ["KD"], c: ["7C"] },
          top: "5S",
          drawPile: ["QD", "KD#2"],
        }),
        "a",
      ),
      { type: "callSunny", playerId: "b", cardId: card("9S").id },
    );
    const view = redact(caught, "a");
    expect(view.phase).toEqual({ kind: "sunnyPlay" });
    // KD answers the 5D and nothing about the 9S, so the reading rule would reach
    // for it — but every card `a` drew lands on top of this one before `b` ever
    // plays against it. (The punishment card no longer does: since #364 it is
    // tucked under the pile. The forced play is still buried either way.)
    expect(decideBotIntent(view)).toEqual({
      type: "playCard",
      playerId: "a",
      cardId: "9S#1",
    });
  });

  it("still gets rid of an 8 first, whatever it leaves behind", () => {
    const state = table({
      hands: { a: ["8H", "5D"], b: ["KD"], c: ["7C"] },
      top: "5S",
      drawPile: ["QD", "KD#2"],
    });
    // The 8 is what stops a bot ever being stuck, so it goes regardless; the suit
    // call that follows is where the next seat gets read.
    expect(decideBotIntent(redact(state, "a"))).toEqual({
      type: "playCard",
      playerId: "a",
      cardId: "8H#1",
    });
  });
});

/** `a` lays its 8 and is left holding two clubs and a diamond. */
const afterTheEight = (options = DEFAULT_OPTIONS): GameState =>
  play(
    table({
      hands: { a: ["8H", "2C", "3C", "4D"], b: ["KD", "3D"], c: ["7S"] },
      top: "5S",
      drawPile: ["QD", "KD#2"],
      options,
    }),
    "a",
    "8H",
  );

describe("a bot naming a suit", () => {
  it("names one the next player is holding, so they have to spend a card", () => {
    // Left to itself the bot would name hearts, holding none. But `b` holds two
    // diamonds and no hearts.
    const view = redact(afterTheEight(), "a");
    expect(view.phase).toEqual({ kind: "suit", playerId: "a" });
    expect(decideBotIntent(view)).toEqual({ type: "chooseSuit", playerId: "a", suit: "D" });
  });

  it("names its own scarcest under the Power of Eights, where it answers itself", () => {
    // The call belongs to `b`, who then has to play against it, so naming a suit
    // `b` holds would be naming one against itself. The old rule stands.
    const view = redact(afterTheEight({ ...DEFAULT_OPTIONS, eights: "nextPlayerNames" }), "b");
    expect(view.phase).toEqual({ kind: "suit", playerId: "b" });
    expect(decideBotIntent(view)).toEqual({ type: "chooseSuit", playerId: "b", suit: "C" });
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
