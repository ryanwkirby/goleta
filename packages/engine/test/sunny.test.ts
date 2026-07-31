import { describe, expect, it } from "vitest";

import { applyIntent, currentPlayer, topCard, type GameState } from "../src/index.ts";
import { allCardIds, card, draw, handOf, must, play, reject, table } from "./helpers.ts";

const call = (state: GameState, playerId: string): GameState =>
  must(state, { type: "callSunny", playerId });

const dispose = (state: GameState, playerId: string, spec: string): GameState =>
  must(state, { type: "disposeCard", playerId, cardId: card(spec).id });

const disposedIds = (state: GameState): string[] => state.disposalPile.map((c) => c.id);

/** a is holding a playable 5H and draws anyway. */
const caughtInTheAct = (): GameState =>
  draw(
    table({
      hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] },
      top: "5S",
      drawPile: ["QD", "KD"],
    }),
    "a",
  );

describe("a correct call", () => {
  it("costs the drawn card, a punishment card, and still forces the play", () => {
    let state = caughtInTheAct();
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1", "KD#1"]);

    state = call(state, "b");
    // The card they drew is gone before they choose anything.
    expect(disposedIds(state)).toEqual(["KD#1"]);
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1"]);
    expect(state.phase).toMatchObject({ kind: "disposal", playerId: "a", reason: "sunnyPunishment" });

    state = dispose(state, "a", "2C");
    expect(disposedIds(state)).toEqual(["KD#1", "2C#1"]);
    expect(state.phase.kind).toBe("sunnyPlay");

    // And they still have to make the play they tried to duck.
    expect(reject(state, { type: "drawCard", playerId: "a" })).toMatch(/can't draw/);
    state = play(state, "a", "5H");
    expect(topCard(state).id).toBe("5H#1");
    expect(currentPlayer(state).id).toBe("b");
    expect(allCardIds(state)).toHaveLength(7);
  });

  it("only the caught player can choose the punishment card", () => {
    const state = call(caughtInTheAct(), "b");
    expect(reject(state, { type: "disposeCard", playerId: "b", cardId: "9H#1" })).toMatch(
      /isn't your card/,
    );
    expect(reject(state, { type: "disposeCard", playerId: "a", cardId: "9H#1" })).toMatch(
      /isn't in your hand/,
    );
  });

  it("takes the second card only, when the first draw was honest", () => {
    // 2C can't be played on 5S, so the first draw is fine. It turns up a 7S,
    // which can be — and drawing again is the offence.
    let state = table({
      hands: { a: ["2C"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: ["QD", "KD", "7S"],
    });
    state = draw(state, "a");
    expect(state.challenge?.violation).toBeNull();
    state = draw(state, "a");

    state = call(state, "b");
    expect(disposedIds(state)).toEqual(["KD#1"]);
    // The honestly drawn 7S stays, and is now the card they're made to play.
    expect(handOf(state, "a")).toEqual(["2C#1", "7S#1"]);
    state = dispose(state, "a", "2C");
    state = play(state, "a", "7S");
    expect(topCard(state).id).toBe("7S#1");
  });
});

describe("a call that lands after the fact", () => {
  it("rewinds a card the drawer has already played", () => {
    let state = play(caughtInTheAct(), "a", "5H");
    expect(currentPlayer(state).id).toBe("b");

    state = call(state, "b");
    // The play is undone: 5H is back in hand and the 5S is showing again.
    expect(topCard(state).id).toBe("5S#1");
    expect(state.activeSuit).toBe("S");
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1"]);
    expect(currentPlayer(state).id).toBe("a");
    expect(allCardIds(state)).toHaveLength(7);
  });

  it("rewinds a wild and the suit it named", () => {
    let state = draw(
      table({ hands: { a: ["8C", "2C"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = play(state, "a", "8C");
    state = must(state, { type: "chooseSuit", playerId: "a", suit: "D" });
    expect(state.activeSuit).toBe("D");

    state = call(state, "b");
    expect(state.activeSuit).toBe("S");
    expect(topCard(state).id).toBe("5S#1");
    expect(handOf(state, "a")).toEqual(["8C#1", "2C#1"]);
  });

  it("can be called while the drawer is still naming a suit", () => {
    let state = draw(
      table({ hands: { a: ["8C", "2C"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = play(state, "a", "8C");
    expect(state.phase.kind).toBe("suit");

    state = call(state, "b");
    expect(state.phase).toMatchObject({ kind: "disposal", playerId: "a" });
    expect(topCard(state).id).toBe("5S#1");
  });

  it("closes the moment the next player acts", () => {
    let state = play(caughtInTheAct(), "a", "5H");
    state = play(state, "b", "9H");
    expect(reject(state, { type: "callSunny", playerId: "c" })).toMatch(/nothing to call/);
  });
});

describe("a wrong call", () => {
  it("costs the caller a card and leaves the turn where it was", () => {
    // 2C and 4H are both dead against the 5S, so drawing is entirely honest.
    let state = draw(
      table({ hands: { a: ["2C", "4H"], b: ["9C", "10C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b");
    expect(state.phase).toMatchObject({ kind: "disposal", playerId: "b", reason: "sunnyBadCall" });

    state = dispose(state, "b", "10C");
    expect(disposedIds(state)).toEqual(["10C#1"]);
    expect(handOf(state, "b")).toEqual(["9C#1"]);
    // a's turn carries on untouched.
    expect(currentPlayer(state).id).toBe("a");
    expect(handOf(state, "a")).toEqual(["2C#1", "4H#1", "KD#1"]);
    expect(state.phase.kind).toBe("action");
  });

  it("passes the turn on when it eliminates the player whose turn it now is", () => {
    // a draws itself out of a turn honestly. b, now on the clock, accuses them
    // anyway and pays with its last card — so the turn it was holding has to
    // move along rather than sit with someone who is out.
    let state = table({
      hands: { a: ["2C"], b: ["9S"], c: ["4S"] },
      top: "5S",
      drawPile: ["6C", "2H", "3D", "4H"],
    });
    state = draw(state, "a");
    state = draw(state, "a");
    state = draw(state, "a");
    expect(currentPlayer(state).id).toBe("b");

    state = call(state, "b");
    state = dispose(state, "b", "9S");
    expect(state.players.find((p) => p.id === "b")?.eliminated).toBe(true);
    expect(currentPlayer(state).id).toBe("c");
    expect(state.phase.kind).toBe("action");
  });

  it("can eliminate the caller who had nothing to spare", () => {
    let state = draw(
      table({ hands: { a: ["2C", "4H"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b");
    state = dispose(state, "b", "9C");
    expect(state.players.find((p) => p.id === "b")?.eliminated).toBe(true);
    expect(state.status).toBe("playing");
  });
});

describe("who may call, and when", () => {
  it("is nobody, before anyone has drawn", () => {
    const state = table({ hands: { a: ["5H"], b: ["9C"], c: ["4D"] }, top: "5S" });
    expect(reject(state, { type: "callSunny", playerId: "b" })).toMatch(/nothing to call/);
  });

  it("is not the drawer", () => {
    expect(reject(caughtInTheAct(), { type: "callSunny", playerId: "a" })).toMatch(/on yourself/);
  });

  it("is not a player who is already out", () => {
    const state = draw(
      table({
        hands: { a: ["5H", "2C"], b: [], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
        out: ["b"],
      }),
      "a",
    );
    expect(reject(state, { type: "callSunny", playerId: "b" })).toMatch(/out of the game/);
  });

  it("is only the first to speak", () => {
    const state = call(caughtInTheAct(), "b");
    expect(reject(state, { type: "callSunny", playerId: "c" })).toMatch(/nothing to call/);
  });

  it("is only the first to speak, even when they were wrong", () => {
    let state = draw(
      table({ hands: { a: ["2C"], b: ["9C", "10C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b");
    state = dispose(state, "b", "10C");
    expect(reject(state, { type: "callSunny", playerId: "c" })).toMatch(/nothing to call/);
  });

  it("reopens on the next draw, so a second offence is still callable", () => {
    let state = draw(
      table({ hands: { a: ["2C"], b: ["9C", "10C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "7S"] }),
      "a",
    );
    state = call(state, "b");
    state = dispose(state, "b", "10C");
    // The 7S they drew is playable, so drawing again is an offence in itself.
    state = draw(state, "a");
    expect(must(state, { type: "callSunny", playerId: "c" }).phase).toMatchObject({
      kind: "disposal",
      playerId: "a",
      reason: "sunnyPunishment",
    });
  });
});

describe("punishment that finishes a player", () => {
  it("skips the forced play when the hand is emptied", () => {
    // a is down to one card, and it's playable, so drawing is an offence.
    let state = draw(
      table({ hands: { a: ["5H"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b");
    state = dispose(state, "a", "5H");

    expect(state.players.find((p) => p.id === "a")?.eliminated).toBe(true);
    expect(currentPlayer(state).id).toBe("b");
    expect(state.status).toBe("playing");
  });

  it("ends the game when it leaves one player standing", () => {
    let state = draw(
      table({ hands: { a: ["5H"], b: ["9C"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b");
    state = dispose(state, "a", "5H");
    expect(state.status).toBe("over");
    expect(state.winnerId).toBe("b");
  });
});

describe("a call that spans a reshuffle", () => {
  it("finds the drawn cards wherever the rewind put them", () => {
    // The offending draw empties the pile; the next one forces a reshuffle, so
    // the second card drawn came from the discards and belongs back there.
    let state = table({
      hands: { a: ["5H", "2C"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: ["7D"],
      buriedDiscards: ["KH", "QH", "JH"],
    });
    const total = allCardIds(state).length;

    state = draw(state, "a");
    state = draw(state, "a");
    expect(state.drawPile.length + state.discardPile.length).toBeGreaterThan(0);
    const drawn = handOf(state, "a").slice(2);
    expect(drawn).toHaveLength(2);

    state = call(state, "b");
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1"]);
    expect(disposedIds(state).toSorted()).toEqual(drawn.toSorted());
    expect(topCard(state).id).toBe("5S#1");
    expect(allCardIds(state)).toHaveLength(total);
    expect(new Set(allCardIds(state)).size).toBe(total);
  });
});

describe("the challenge window", () => {
  it("never tells the caller whether the draw was legal", () => {
    // Both games look identical from the outside: someone drew a card, and a
    // call is available. Only the outcome differs.
    const guilty = caughtInTheAct();
    const innocent = draw(
      table({ hands: { a: ["2C"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    for (const state of [guilty, innocent]) {
      expect(state.challenge?.drawerId).toBe("a");
      expect(state.challenge?.resolved).toBe(false);
      expect(applyIntent(state, { type: "callSunny", playerId: "b" }).ok).toBe(true);
    }
  });
});
