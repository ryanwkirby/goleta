import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPTIONS,
  applyIntent,
  buildDeck,
  currentPlayer,
  isPlayable,
  legalCards,
  startGame,
  topCard,
  type GameState,
} from "../src/index.ts";
import { allCardIds, card, draw, handOf, must, play, reject, table } from "./helpers.ts";

describe("the deck", () => {
  it("is one of every card", () => {
    const deck = buildDeck(DEFAULT_OPTIONS.deckCount);
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(deck.filter((c) => c.rank === "8")).toHaveLength(4);
  });

  it("gives every card of a second deck its own id", () => {
    const deck = buildDeck(2);
    expect(new Set(deck.map((c) => c.id)).size).toBe(104);
  });
});

describe("dealing", () => {
  it("gives everyone a hand and turns one card up", () => {
    const state = startGame(["a", "b", "c"], 99);
    for (const player of state.players) {
      expect(player.hand).toHaveLength(DEFAULT_OPTIONS.startingHandSize);
    }
    expect(state.discardPile).toHaveLength(1);
    expect(allCardIds(state)).toHaveLength(52);
    expect(new Set(allCardIds(state)).size).toBe(52);
  });

  it("seats a full table of eight from one deck", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const state = startGame(ids, 11);
    expect(state.players).toHaveLength(8);
    expect(allCardIds(state)).toHaveLength(52);
    // 24 dealt and one turned up still leaves a deck worth drawing from.
    expect(state.drawPile).toHaveLength(27);
  });

  it("opens on the player to the dealer's left", () => {
    const ids = ["a", "b", "c", "d"];
    expect(currentPlayer(startGame(ids, 3, DEFAULT_OPTIONS, 0)).id).toBe("b");
    expect(currentPlayer(startGame(ids, 3, DEFAULT_OPTIONS, 2)).id).toBe("d");
  });

  it("wraps the lead round when the last seat deals", () => {
    const ids = ["a", "b", "c", "d"];
    expect(currentPlayer(startGame(ids, 3, DEFAULT_OPTIONS, 3)).id).toBe("a");
  });

  it("keeps an 8 turned up as the seed card, as a natural 8", () => {
    // Nothing is buried or redealt: whatever comes up is the card in play, and
    // its own suit is the suit to match.
    for (let seed = 1; seed <= 200; seed++) {
      const state = startGame(["a", "b", "c"], seed);
      expect(state.activeSuit).toBe(topCard(state).suit);
      expect(state.phase.kind).toBe("action");
    }
    // And at least one of those seeds really did turn up an 8.
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    expect(seeds.some((seed) => topCard(startGame(["a", "b", "c"], seed)).rank === "8")).toBe(true);
  });

  it("deals the same game from the same seed", () => {
    expect(startGame(["a", "b", "c"], 7)).toEqual(startGame(["a", "b", "c"], 7));
    expect(startGame(["a", "b", "c"], 7)).not.toEqual(startGame(["a", "b", "c"], 8));
  });

  it("refuses a table that can't be dealt", () => {
    expect(() => startGame(["a"], 1)).toThrow(/at least two/);
    expect(() => startGame(["a", "a", "b"], 1)).toThrow(/unique/);
    expect(() => startGame(["a", "b", "c"], 1, { deckCount: 1, startingHandSize: 30 })).toThrow(
      /won't fit/,
    );
    expect(() => startGame(["a", "b", "c"], 1, DEFAULT_OPTIONS, 3)).toThrow(/no seat 3/);
  });
});

describe("what can be played", () => {
  it("matches on suit or rank, and 8s match anything", () => {
    expect(isPlayable(card("5H"), "H", "K")).toBe(true);
    expect(isPlayable(card("KS"), "H", "K")).toBe(true);
    expect(isPlayable(card("2C"), "H", "K")).toBe(false);
    expect(isPlayable(card("8C"), "H", "K")).toBe(true);
  });

  it("follows the named suit rather than the wild's own", () => {
    // An 8S is showing but Hearts was named: spades are dead, hearts play.
    const state = table({ hands: { a: ["3S", "3H"] }, top: "8S", activeSuit: "H" });
    expect(legalCards(state, currentPlayer(state)).map((c) => c.id)).toEqual(["3H#1"]);
  });
});

describe("taking a turn", () => {
  it("plays a matching card and passes the turn on", () => {
    const state = play(table({ hands: { a: ["5H", "2C"], b: ["9D"] }, top: "5S" }), "a", "5H");
    expect(topCard(state).id).toBe("5H#1");
    expect(state.activeSuit).toBe("H");
    expect(handOf(state, "a")).toEqual(["2C#1"]);
    expect(currentPlayer(state).id).toBe("b");
  });

  it("refuses a card that doesn't match", () => {
    const state = table({ hands: { a: ["2C"], b: ["9D"] }, top: "5S" });
    expect(reject(state, { type: "playCard", playerId: "a", cardId: "2C#1" })).toMatch(/match/);
  });

  it("refuses to let anyone play out of turn", () => {
    const state = table({ hands: { a: ["5H"], b: ["9S"] }, top: "5S" });
    expect(reject(state, { type: "playCard", playerId: "b", cardId: "9S#1" })).toMatch(/turn/);
  });

  it("draws when stuck, and the turn stays put", () => {
    const state = draw(
      table({ hands: { a: ["2C"], b: ["9D"] }, top: "5S", drawPile: ["KH", "7D"] }),
      "a",
    );
    expect(handOf(state, "a")).toEqual(["2C#1", "7D#1"]);
    expect(currentPlayer(state).id).toBe("a");
    expect(state.drawsThisTurn).toBe(1);
  });

  it("keeps the turn open when a drawn card unsticks you, so you must play it", () => {
    const state = draw(
      table({ hands: { a: ["2C"], b: ["9D"] }, top: "5S", drawPile: ["KH", "7S"] }),
      "a",
    );
    // The rule is "if you can play, you must" — the turn does not end here, and
    // drawing again from this position is the Sunny Rule's business.
    expect(currentPlayer(state).id).toBe("a");
    expect(legalCards(state, currentPlayer(state))).toHaveLength(1);
  });

  it("ends the turn after three fruitless draws", () => {
    let state = table({
      hands: { a: ["2C"], b: ["9S"] },
      top: "5S",
      drawPile: ["6C", "2H", "3D", "4H"],
    });
    state = draw(state, "a");
    state = draw(state, "a");
    expect(currentPlayer(state).id).toBe("a");
    state = draw(state, "a");
    expect(currentPlayer(state).id).toBe("b");
    expect(handOf(state, "a")).toHaveLength(4);
  });

  it("refuses a fourth draw", () => {
    let state = table({
      hands: { a: ["2C"], b: ["9S"] },
      top: "5S",
      drawPile: ["6C", "2H", "3D", "4H"],
    });
    state = draw(state, "a");
    state = draw(state, "a");
    // The third draw ends the turn, so a fourth isn't even a's to take.
    state = draw(state, "a");
    expect(reject(state, { type: "drawCard", playerId: "a" })).toMatch(/turn/);
  });
});

describe("wild eights", () => {
  it("names the suit for the next player", () => {
    let state = table({ hands: { a: ["8C"], b: ["9D"], c: ["2H"] }, top: "5S" });
    state = play(state, "a", "8C");
    expect(state.phase.kind).toBe("suit");
    expect(currentPlayer(state).id).toBe("a");

    state = must(state, { type: "chooseSuit", playerId: "a", suit: "D" });
    expect(state.activeSuit).toBe("D");
    expect(currentPlayer(state).id).toBe("b");
  });

  it("still lets a player name the suit on the way out", () => {
    let state = table({ hands: { a: ["8C"], b: ["9D"], c: ["2H"] }, top: "5S" });
    state = play(state, "a", "8C");
    expect(state.players[0]?.eliminated).toBe(true);
    state = must(state, { type: "chooseSuit", playerId: "a", suit: "H" });
    expect(state.activeSuit).toBe("H");
    expect(currentPlayer(state).id).toBe("b");
  });

  it("means the holder can never legally draw", () => {
    const state = table({ hands: { a: ["8C"], b: ["9D"] }, top: "5S", drawPile: ["2D"] });
    // Nothing in the engine blocks it — but it is a violation, and now callable.
    const after = draw(state, "a");
    expect(after.challenge?.violation).not.toBeNull();
  });
});

describe("running out of cards", () => {
  it("eliminates a player whose hand empties and passes over them", () => {
    let state = table({ hands: { a: ["5H"], b: ["9H"], c: ["2C"] }, top: "5S" });
    state = play(state, "a", "5H");
    expect(state.players[0]?.eliminated).toBe(true);
    expect(currentPlayer(state).id).toBe("b");

    state = play(state, "b", "9H");
    // b is out too; the turn skips a and lands on c, the last player standing.
    expect(state.status).toBe("over");
    expect(state.winnerId).toBe("c");
  });

  it("hands the game to whoever is still holding cards", () => {
    const state = play(table({ hands: { a: ["5H"], b: ["9D"] }, top: "5S" }), "a", "5H");
    expect(state.status).toBe("over");
    expect(state.winnerId).toBe("b");
    expect(reject(state, { type: "drawCard", playerId: "b" })).toMatch(/over/);
  });
});

describe("when the deck runs out", () => {
  it("recycles the whole face-up pile and turns a fresh card up", () => {
    const state = draw(
      table({
        hands: { a: ["2C"], b: ["9D"] },
        top: "5S",
        drawPile: [],
        buriedDiscards: ["KH", "QH", "3C", "4C"],
      }),
      "a",
    );
    // Nothing is held back, so the card that was in play is in the deck now
    // and the pile is one freshly turned card.
    expect(state.discardPile).toHaveLength(1);
    expect(state.drawPile).toHaveLength(4);
    expect(state.activeSuit).toBe(topCard(state).suit);
    // The recycle is the whole action — no card reached a hand.
    expect(handOf(state, "a")).toEqual(["2C#1"]);
    expect(state.drawsThisTurn).toBe(0);
    expect(currentPlayer(state).id).toBe("a");
    expect(allCardIds(state)).toHaveLength(7);
  });

  it("lets a player carry on drawing afterwards, up to their three", () => {
    let state = table({
      hands: { a: ["2C"], b: ["9D"] },
      top: "5S",
      drawPile: [],
      buriedDiscards: ["KH", "QH", "JH", "10H"],
    });
    state = draw(state, "a");
    expect(state.drawsThisTurn).toBe(0);
    state = draw(state, "a");
    expect(state.drawsThisTurn).toBe(1);
    expect(handOf(state, "a")).toHaveLength(2);
  });

  it("hands the must-play rule back the moment the new card gives them a play", () => {
    // Nothing in a's hand touches the 5S, and the deck is empty. The recycle
    // turns up a card that 2C does match, so drawing again is now an offence
    // and playing is compulsory.
    let state = table({
      hands: { a: ["2C"], b: ["9D"] },
      top: "5S",
      drawPile: [],
      buriedDiscards: ["2H"],
    });
    state = draw(state, "a");
    expect(topCard(state).id).toBe("2H#1");
    expect(legalCards(state, currentPlayer(state)).map((c) => c.id)).toEqual(["2C#1"]);
    expect(draw(state, "a").challenge?.violation).not.toBeNull();
  });

  it("turns up a natural 8 without stopping to name a suit", () => {
    const state = draw(
      table({ hands: { a: ["2C"], b: ["9D"] }, top: "5S", drawPile: [], buriedDiscards: ["8H"] }),
      "a",
    );
    expect(topCard(state).id).toBe("8H#1");
    expect(state.activeSuit).toBe("H");
    expect(state.phase.kind).toBe("action");
  });

  it("ends the turn when there is genuinely nothing left to draw", () => {
    const state = draw(table({ hands: { a: ["2C"], b: ["9S"] }, top: "5S", drawPile: [] }), "a");
    expect(currentPlayer(state).id).toBe("b");
    expect(handOf(state, "a")).toEqual(["2C#1"]);
  });

  it("ends the game rather than hanging when nobody can move", () => {
    // No pile to draw from, and neither hand matches the 5S showing.
    const state: GameState = draw(
      table({ hands: { a: ["2C"], b: ["9D", "10H"] }, top: "5S", drawPile: [] }),
      "a",
    );
    expect(state.status).toBe("over");
    expect(state.winnerId).toBe("b");
  });
});

describe("card conservation", () => {
  it("holds across a run of ordinary turns", () => {
    let state = startGame(["a", "b", "c"], 4242);
    const before = allCardIds(state).length;

    for (let turn = 0; turn < 40 && state.status === "playing"; turn++) {
      const player = currentPlayer(state);
      if (state.phase.kind === "suit") {
        state = must(state, { type: "chooseSuit", playerId: player.id, suit: "H" });
      } else {
        const playable = legalCards(state, player)[0];
        const result = applyIntent(
          state,
          playable
            ? { type: "playCard", playerId: player.id, cardId: playable.id }
            : { type: "drawCard", playerId: player.id },
        );
        expect(result.ok).toBe(true);
        if (result.ok) state = result.state;
      }
      expect(allCardIds(state)).toHaveLength(before);
      expect(new Set(allCardIds(state)).size).toBe(before);
    }
  });
});
