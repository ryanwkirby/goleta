import { describe, expect, it } from "vitest";

import { DEFAULT_OPTIONS, redact, startGame, type GameState } from "../src/index.ts";
import { cards, draw, table } from "./helpers.ts";

describe("hands", () => {
  it("are face up: every seat, every viewer, including a spectator", () => {
    const state = startGame(["a", "b", "c"], 42);
    for (const viewer of ["a", "b", "c", null]) {
      const view = redact(state, viewer);
      for (const player of view.players) {
        expect(player.hand).toHaveLength(DEFAULT_OPTIONS.startingHandSize);
      }
    }
  });
});

describe("what never leaves the server", () => {
  it("never ships the challenge, which carries every hand in a snapshot", () => {
    const state = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["KD"] }),
      "a",
    );
    expect(state.challenge?.violation?.snapshot).toBeDefined();

    const wire = JSON.stringify(redact(state, "b"));
    expect(wire).not.toContain("snapshot");
    expect(wire).not.toContain("violation");
    expect(wire).not.toContain("challenge");
    // The pre-draw hand to accuse from is the one thing about the challenge a caller
    // is actually shown.
    expect(wire).toContain("5H#1");
  });
});

describe("the Sunny reach", () => {
  it("hands an eligible caller the offender's pre-draw hand and the board, never whether it lands", () => {
    const guilty = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["KD"] }),
      "a",
    );
    const innocent = draw(
      table({ hands: { a: ["2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    // The call is available either way — you may always accuse — and both hand back
    // the hand and board a caller needs, never the drawn card. Nothing else
    // distinguishes the two views.
    expect(redact(guilty, "b").sunnyCallable).toBe(true);
    expect(redact(guilty, "b").sunnyTargetId).toBe("a");
    expect(redact(guilty, "b").sunnyReach).toEqual({
      hand: cards("5H", "2C"),
      activeSuit: "S",
      topRank: "5",
    });

    expect(redact(innocent, "b").sunnyCallable).toBe(true);
    expect(redact(innocent, "b").sunnyTargetId).toBe("a");
    expect(redact(innocent, "b").sunnyReach).toEqual({
      hand: cards("2C"),
      activeSuit: "S",
      topRank: "5",
    });
  });

  it("never tells the drawer they've been caught", () => {
    const guilty = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["KD"] }),
      "a",
    );
    // A caught player learns nothing from their own screen, and neither does a
    // spectator, who has no call to make.
    expect(redact(guilty, "a").sunnyReach).toBeNull();
    expect(redact(guilty, null).sunnyReach).toBeNull();
  });

  it("isn't offered to the drawer, or to anyone once the window shuts", () => {
    const state = draw(
      table({ hands: { a: ["2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    expect(state.status).toBe("playing");
    expect(redact(state, "a").sunnyCallable).toBe(false);

    const fresh = table({ hands: { a: ["5H"], b: ["9H"], c: ["4D"] }, top: "5S" });
    expect(redact(fresh, "b").sunnyCallable).toBe(false);
  });

  it("isn't offered to a spectator, who holds no cards to lose", () => {
    const state = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["KD"] }),
      "a",
    );
    const view = redact(state, null);
    expect(view.you).toBeNull();
    expect(view.sunnyCallable).toBe(false);
    expect(view.legalCardIds).toEqual([]);
  });
});

describe("what the table can always see", () => {
  it("includes the size of the one face-up pile, but not what is under the top", () => {
    const state = table({
      hands: { a: ["5H"], b: ["9H"], c: ["4D"] },
      top: "5S",
      buriedDiscards: ["KC", "QC"],
    });
    const view = redact(state, "a");
    expect(view.discardPileSize).toBe(3);
    expect(view.topCard.id).toBe("5S#1");
    // Only the top card is named. What is buried under it stays buried.
    expect(JSON.stringify(view)).not.toMatch(/KC#1|QC#1/);
  });

  it("names who the game is waiting on, even mid-punishment", () => {
    const state = table({ hands: { a: ["5H"], b: ["9H"], c: ["4D"] }, top: "5S" });
    expect(redact(state, "c").waitingOn).toBe("a");

    const surrendering: GameState = {
      ...state,
      phase: { kind: "surrender", playerId: "b", reason: "sunnyPunishment" },
    };
    const view = redact(surrendering, "c");
    expect(view.waitingOn).toBe("b");
    expect(view.phase).toEqual({ kind: "surrender", playerId: "b", reason: "sunnyPunishment" });
  });

  it("never names the cards a caught player is about to have turned up", () => {
    // Still in the deck. Which cards are coming off it is not told in advance.
    const state: GameState = {
      ...table({ hands: { a: ["5H"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["KD", "QD"] }),
      sunny: { offenderId: "a", touchedIds: ["KD#1", "QD#1"] },
      phase: { kind: "sunnyPlay" },
    };
    for (const viewer of ["a", "b", "c", null]) {
      const payload = JSON.stringify(redact(state, viewer));
      expect(payload).not.toMatch(/KD#1|QD#1/);
    }
  });
});
