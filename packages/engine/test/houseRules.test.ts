/**
 * The alternate rules, and the switch that turns the Sunny Rule off.
 * `simulation.test.ts` proves each combination terminates and conserves cards;
 * this is about whether each one does the specific thing it promises. The
 * standard-rules half of each pair matters as much as the variant.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPTIONS,
  applyIntent,
  currentPlayer,
  redact,
  startGame,
  topCard,
  type GameOptions,
  type GameState,
} from "../src/index.ts";
import { card, draw, handOf, must, play, reject, surrender, table } from "./helpers.ts";

const withRules = (rules: Partial<GameOptions>): GameOptions => ({ ...DEFAULT_OPTIONS, ...rules });

const nameSuit = (state: GameState, playerId: string, suit: "C" | "D" | "H" | "S"): GameState =>
  must(state, { type: "chooseSuit", playerId, suit });

describe("the Power of Eights", () => {
  const powerOfEights = withRules({ eights: "nextPlayerNames" });

  it("hands the suit to the next player, who then plays against it", () => {
    let state = table({
      hands: { a: ["8C", "2C"], b: ["9H", "3S"], c: ["4D"] },
      top: "5S",
      options: powerOfEights,
    });

    state = play(state, "a", "8C");
    // The turn hasn't moved yet — b owes the suit, and a is still seated.
    expect(state.phase).toEqual({ kind: "suit", playerId: "b" });
    expect(currentPlayer(state).id).toBe("a");
    expect(reject(state, { type: "chooseSuit", playerId: "a", suit: "H" })).toMatch(
      /Not your call/,
    );

    // b names hearts, and then it is b's turn to play against hearts.
    state = nameSuit(state, "b", "H");
    expect(state.activeSuit).toBe("H");
    expect(currentPlayer(state).id).toBe("b");
    expect(state.phase.kind).toBe("action");
  });

  it("leaves the standard rule alone", () => {
    let state = table({ hands: { a: ["8C", "2C"], b: ["9H"], c: ["4D"] }, top: "5S" });
    state = play(state, "a", "8C");
    expect(state.phase).toEqual({ kind: "suit", playerId: "a" });

    state = nameSuit(state, "a", "H");
    expect(state.activeSuit).toBe("H");
    expect(currentPlayer(state).id).toBe("b");
  });

  it("skips a player who is already out", () => {
    let state = table({
      hands: { a: ["8C", "2C"], b: [], c: ["4D"] },
      top: "5S",
      out: ["b"],
      options: powerOfEights,
    });
    state = play(state, "a", "8C");
    // b is out, so the call passes over them to c.
    expect(state.phase).toEqual({ kind: "suit", playerId: "c" });

    state = nameSuit(state, "c", "D");
    expect(currentPlayer(state).id).toBe("c");
  });

  it("passes the call on when the 8 was the player's last card", () => {
    // Under the standard rule you name the suit on your way out. Here the call was
    // never yours, so being eliminated changes nothing.
    let state = table({
      hands: { a: ["8C"], b: ["9H"], c: ["4D"] },
      top: "5S",
      options: powerOfEights,
    });
    state = play(state, "a", "8C");

    expect(state.players.find((p) => p.id === "a")?.eliminated).toBe(true);
    expect(state.phase).toEqual({ kind: "suit", playerId: "b" });
    state = nameSuit(state, "b", "D");
    expect(currentPlayer(state).id).toBe("b");
  });

  it("still lets a Sunny call rewind the 8 and the suit it named", () => {
    let state = draw(
      table({
        hands: { a: ["8C", "2C"], b: ["9C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
        options: powerOfEights,
      }),
      "a",
    );
    state = play(state, "a", "8C");
    state = nameSuit(state, "b", "D");
    expect(state.activeSuit).toBe("D");

    // c catches the draw a made while holding the playable 8.
    state = must(state, { type: "callSunny", playerId: "c", cardId: card("8C").id });
    expect(state.activeSuit).toBe("S");
    expect(topCard(state).id).toBe("5S#1");
    expect(handOf(state, "a")).toEqual(["8C#1", "2C#1"]);
    expect(state.phase.kind).toBe("sunnyPlay");
  });

  it("still names nothing for an 8 played during a Sunny resolution", () => {
    // The touched card lands on top a moment later, so there is no suit worth
    // naming, however the table has configured eights.
    let state = draw(
      table({
        hands: { a: ["8C", "2C"], b: ["9C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
        options: powerOfEights,
      }),
      "a",
    );
    state = must(state, { type: "callSunny", playerId: "b", cardId: card("8C").id });
    state = play(state, "a", "8C");
    expect(state.phase).toMatchObject({ kind: "surrender", reason: "sunnyPunishment" });

    state = surrender(state, "a", "2C");
    expect(topCard(state).id).toBe("KD#1");
    expect(state.activeSuit).toBe("D");
  });
});

describe("Dealer's Choice", () => {
  const dealersChoice = withRules({ seedEight: "dealerNames" });
  const ids = ["a", "b", "c", "d"];

  /** A seed whose deal turns an 8 face up to start, and one whose doesn't. */
  const seedWhere = (wantEight: boolean): number => {
    for (let seed = 1; seed < 5000; seed++) {
      const game = startGame(ids, seed, DEFAULT_OPTIONS, 0);
      if ((topCard(game).rank === "8") === wantEight) return seed;
    }
    throw new Error(`no seed found with an 8 seed card: ${wantEight}`);
  };

  it("gives the dealer the suit before anyone plays", () => {
    const seed = seedWhere(true);
    let state = startGame(ids, seed, dealersChoice, 0);
    expect(topCard(state).rank).toBe("8");
    // The dealer is seat 0 and owes the suit; nobody may play yet.
    expect(state.phase).toEqual({ kind: "suit", playerId: "a" });
    expect(reject(state, { type: "drawCard", playerId: "b" })).toMatch(/Can't draw/);

    state = nameSuit(state, "a", "H");
    expect(state.activeSuit).toBe("H");
    // Naming advances off the dealer onto their left, which is who opens.
    expect(currentPlayer(state).id).toBe("b");
    expect(state.phase.kind).toBe("action");
    // And that is turn one, not turn two.
    expect(state.turnNumber).toBe(1);
  });

  it("follows the dealer round the table", () => {
    const seed = seedWhere(true);
    const state = startGame(ids, seed, dealersChoice, 2);
    expect(state.phase).toEqual({ kind: "suit", playerId: "c" });
    expect(currentPlayer(nameSuit(state, "c", "S")).id).toBe("d");
  });

  it("leaves an 8 seed natural under the standard rule", () => {
    const seed = seedWhere(true);
    const state = startGame(ids, seed, DEFAULT_OPTIONS, 0);
    expect(state.phase).toEqual({ kind: "action" });
    expect(state.activeSuit).toBe(topCard(state).suit);
    expect(currentPlayer(state).id).toBe("b");
    expect(state.turnNumber).toBe(1);
  });

  it("does nothing at all when the seed card isn't an 8", () => {
    const seed = seedWhere(false);
    const withRule = startGame(ids, seed, dealersChoice, 0);
    const without = startGame(ids, seed, DEFAULT_OPTIONS, 0);
    expect(withRule.phase).toEqual({ kind: "action" });
    // Identical but for the options they were dealt under.
    expect({ ...withRule, options: DEFAULT_OPTIONS }).toEqual(without);
  });
});

/** `a` holds a playable 5H and draws anyway — an offence, if anyone is counting. */
const illegalDraw = (options: GameOptions): GameState =>
  draw(
    table({
      hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] },
      top: "5S",
      drawPile: ["QD", "KD"],
      options,
    }),
    "a",
  );

describe("a table playing without the Sunny Rule", () => {
  const noSunny = withRules({ sunny: null });

  it("opens no challenge window, and takes no snapshot", () => {
    const state = illegalDraw(noSunny);
    expect(state.challenge).toBeNull();
    // The counter the lockout is measured on never starts: the per-draw bookkeeping
    // never happens at all.
    expect(state.totalDraws).toBe(0);
    // The draw itself is perfectly ordinary.
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1", "KD#1"]);
  });

  it("says the rule is off rather than that you were too slow", () => {
    const state = illegalDraw(noSunny);
    expect(reject(state, { type: "callSunny", playerId: "b", cardId: card("5H").id })).toMatch(
      /No Sunny Rule here/,
    );
  });

  it("tells nobody there is anything to call", () => {
    const state = illegalDraw(noSunny);
    for (const viewer of ["a", "b", "c", null]) {
      const view = redact(state, viewer);
      expect(view.sunnyCallable).toBe(false);
      expect(view.sunnyTargetId).toBeNull();
      expect(view.sunnyReach).toBeNull();
      expect(view.sunnyLockedDraws).toBe(0);
    }
  });

  it("still catches the same draw with the rule on", () => {
    const state = illegalDraw(DEFAULT_OPTIONS);
    expect(state.challenge?.violation).not.toBeNull();
    expect(state.totalDraws).toBe(1);
    expect(
      applyIntent(state, { type: "callSunny", playerId: "b", cardId: card("5H").id }).ok,
    ).toBe(true);
  });

  it("reads the lockout length from the table's own rules", () => {
    // Not a lobby control this pass, but the engine takes it from options rather
    // than a constant.
    let state = draw(
      table({
        hands: { a: ["2C"], b: ["9C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
        options: withRules({ sunny: { lockoutDraws: 7 } }),
      }),
      "a",
    );
    state = must(state, { type: "callSunny", playerId: "b", cardId: card("2C").id });
    expect(state.sunnyLockouts.b).toBe(state.totalDraws + 7);
  });
});
