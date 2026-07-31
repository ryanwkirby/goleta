import { describe, expect, it } from "vitest";

import { applyIntent, currentPlayer, topCard, type GameState } from "../src/index.ts";
import {
  allCardIds,
  draw,
  handOf,
  must,
  pileFromTop,
  play,
  reject,
  surrender,
  table,
} from "./helpers.ts";

const call = (state: GameState, playerId: string): GameState =>
  must(state, { type: "callSunny", playerId });

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
  it("forces the skipped play, then a punishment, then turns up what they touched", () => {
    let state = caughtInTheAct();
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1", "KD#1"]);

    state = call(state, "b");
    // The rewind puts the drawn card back, so the hand is as it was and the
    // play they were dodging is the first thing they owe.
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1"]);
    expect(state.phase.kind).toBe("sunnyPlay");
    expect(reject(state, { type: "drawCard", playerId: "a" })).toMatch(/can't draw/);

    state = play(state, "a", "5H");
    expect(state.phase).toMatchObject({
      kind: "surrender",
      playerId: "a",
      reason: "sunnyPunishment",
    });

    // Any card at all — 2C doesn't match the 5H it lands on.
    state = surrender(state, "a", "2C");

    // Skipped play, punishment, then the touched card on top of both.
    expect(pileFromTop(state).slice(0, 3)).toEqual(["KD#1", "2C#1", "5H#1"]);
    expect(topCard(state).id).toBe("KD#1");
    expect(state.activeSuit).toBe("D");
    expect(handOf(state, "a")).toEqual([]);
    expect(currentPlayer(state).id).toBe("b");
    expect(allCardIds(state)).toHaveLength(7);
  });

  it("costs two cards from hand — one more than an honest turn would have", () => {
    let state = caughtInTheAct();
    state = call(state, "b");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");
    // They started the turn on two cards and finish it on none.
    expect(handOf(state, "a")).toEqual([]);
  });

  it("lets only the caught player choose the punishment card", () => {
    let state = call(caughtInTheAct(), "b");
    state = play(state, "a", "5H");
    expect(reject(state, { type: "surrenderCard", playerId: "b", cardId: "9H#1" })).toMatch(
      /isn't your card/,
    );
    expect(reject(state, { type: "surrenderCard", playerId: "a", cardId: "9H#1" })).toMatch(
      /isn't in your hand/,
    );
  });

  it("turns up the second card only, when the first draw was honest", () => {
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
    // The honestly drawn 7S stays, and is now the card they're made to play.
    expect(handOf(state, "a")).toEqual(["2C#1", "7S#1"]);
    state = play(state, "a", "7S");
    state = surrender(state, "a", "2C");
    expect(topCard(state).id).toBe("KD#1");
    expect(pileFromTop(state).slice(0, 3)).toEqual(["KD#1", "2C#1", "7S#1"]);
  });

  it("turns up every illegally drawn card, the last one landing on top", () => {
    // 5H is playable on 5S from the start, so both draws are offences.
    let state = table({
      hands: { a: ["5H", "2C"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: ["QD", "KD", "3H"],
    });
    state = draw(state, "a");
    state = draw(state, "a");
    expect(state.challenge?.violation?.touchedIds).toEqual(["3H#1", "KD#1"]);

    state = call(state, "b");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");
    expect(pileFromTop(state).slice(0, 4)).toEqual(["KD#1", "3H#1", "2C#1", "5H#1"]);
    expect(state.activeSuit).toBe("D");
  });

  it("treats an 8 turned up off the deck as natural", () => {
    let state = draw(
      table({
        hands: { a: ["5H", "2C"], b: ["9C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "8D"],
      }),
      "a",
    );
    state = call(state, "b");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");

    expect(topCard(state).id).toBe("8D#1");
    // Its own suit, and nobody was asked to name one.
    expect(state.activeSuit).toBe("D");
    expect(state.phase.kind).toBe("action");
    expect(currentPlayer(state).id).toBe("b");
  });

  it("does not stop to name a suit for an 8 played during the resolution", () => {
    // The touched card lands on top a moment later, so anything named would be
    // erased before the next player saw it.
    let state = draw(
      table({
        hands: { a: ["8C", "2C"], b: ["9C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
      }),
      "a",
    );
    state = call(state, "b");
    state = play(state, "a", "8C");
    expect(state.phase).toMatchObject({ kind: "surrender", reason: "sunnyPunishment" });

    state = surrender(state, "a", "2C");
    expect(topCard(state).id).toBe("KD#1");
    expect(state.activeSuit).toBe("D");
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
    expect(state.phase.kind).toBe("sunnyPlay");
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
    expect(state.phase.kind).toBe("sunnyPlay");
    expect(topCard(state).id).toBe("5S#1");
  });

  it("closes the moment the next player acts", () => {
    let state = play(caughtInTheAct(), "a", "5H");
    state = play(state, "b", "9H");
    expect(reject(state, { type: "callSunny", playerId: "c" })).toMatch(/nothing to call/);
  });
});

describe("a wrong call", () => {
  it("buries a card of the caller's at the bottom, changing nothing else", () => {
    // 2C and 4H are both dead against the 5S, so drawing is entirely honest.
    let state = draw(
      table({
        hands: { a: ["2C", "4H"], b: ["9C", "10C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
        buriedDiscards: ["JH"],
      }),
      "a",
    );
    state = call(state, "b");
    expect(state.phase).toMatchObject({ kind: "surrender", playerId: "b", reason: "sunnyBadCall" });

    state = surrender(state, "b", "10C");
    // Under everything already played, so the card to match is untouched.
    expect(state.discardPile.map((c) => c.id)).toEqual(["10C#1", "JH#1", "5S#1"]);
    expect(topCard(state).id).toBe("5S#1");
    expect(state.activeSuit).toBe("S");
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
    state = surrender(state, "b", "9S");
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
    state = surrender(state, "b", "9C");
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
    state = surrender(state, "b", "10C");
    expect(reject(state, { type: "callSunny", playerId: "c" })).toMatch(/nothing to call/);
  });

  it("reopens on the next draw, so a second offence is still callable", () => {
    let state = draw(
      table({ hands: { a: ["2C"], b: ["9C", "10C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "7S"] }),
      "a",
    );
    state = call(state, "b");
    state = surrender(state, "b", "10C");
    // The 7S they drew is playable, so drawing again is an offence in itself.
    state = draw(state, "a");
    expect(must(state, { type: "callSunny", playerId: "c" }).phase.kind).toBe("sunnyPlay");
  });
});

describe("a resolution that finishes a player", () => {
  it("skips the punishment when the forced play empties the hand", () => {
    // a is down to one card, and it's playable, so drawing is an offence.
    let state = draw(
      table({ hands: { a: ["5H"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b");
    state = play(state, "a", "5H");

    expect(state.players.find((p) => p.id === "a")?.eliminated).toBe(true);
    // Nothing left to punish, but the card they touched still comes up.
    expect(topCard(state).id).toBe("KD#1");
    expect(currentPlayer(state).id).toBe("b");
    expect(state.status).toBe("playing");
  });

  it("ends the game when the forced play leaves one player standing", () => {
    let state = draw(
      table({ hands: { a: ["5H"], b: ["9C"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b");
    state = play(state, "a", "5H");
    expect(state.status).toBe("over");
    expect(state.winnerId).toBe("b");
  });

  it("ends the game when the punishment card leaves one player standing", () => {
    let state = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9C"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");
    expect(state.status).toBe("over");
    expect(state.winnerId).toBe("b");
  });
});

describe("a call that spans a recycle", () => {
  it("finds the touched cards wherever the rewind put them", () => {
    // The offending draw empties the deck. The next tap recycles the pile
    // rather than drawing, and the tap after that takes a card that was in the
    // face-up pile at the moment the rewind snapshot was taken.
    let state = table({
      hands: { a: ["5H", "2C"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: ["7D"],
      buriedDiscards: ["KH", "QH", "JH"],
    });
    const total = allCardIds(state).length;

    state = draw(state, "a");
    state = draw(state, "a");
    state = draw(state, "a");
    const drawn = handOf(state, "a").slice(2);
    expect(drawn).toHaveLength(2);

    state = call(state, "b");
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1"]);
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");

    // Both touched cards end up face up, and nothing has gone missing or been
    // duplicated along the way.
    expect(pileFromTop(state).slice(0, 2).toSorted()).toEqual(drawn.toSorted());
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
