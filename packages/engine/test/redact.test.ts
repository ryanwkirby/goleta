import { describe, expect, it } from "vitest";

import { redact, redactEvent, startGame, type GameState } from "../src/index.ts";
import { draw, table } from "./helpers.ts";

const hiddenView = (state: GameState, viewer: string) =>
  redact(state, viewer, { handsVisible: false });

describe("with hands down", () => {
  it("sends counts and never a card", () => {
    const state = startGame(["a", "b", "c"], 31337);
    const view = hiddenView(state, "a");

    const others = view.players.filter((p) => p.id !== "a");
    expect(others).toHaveLength(2);
    for (const player of others) {
      expect(player.hand).toBeNull();
      expect(player.cardCount).toBe(5);
    }
    expect(view.players.find((p) => p.id === "a")?.hand).toHaveLength(5);
  });

  it("leaks no other hand into the serialised payload", () => {
    // The real test: not what the shape looks like, but whether any card id
    // belonging to someone else survives anywhere in the bytes on the wire.
    let state = startGame(["a", "b", "c", "d"], 555);
    state = draw(state, state.players[0]?.id ?? "a");

    for (const viewer of state.players) {
      const wire = JSON.stringify(hiddenView(state, viewer.id));
      const foreign = state.players
        .filter((p) => p.id !== viewer.id)
        .flatMap((p) => p.hand.map((c) => c.id));
      for (const cardId of foreign) {
        expect(wire, `${cardId} leaked into ${viewer.id}'s view`).not.toContain(cardId);
      }
    }
  });

  it("never ships the challenge, which carries every hand in a snapshot", () => {
    const state = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["KD"] }),
      "a",
    );
    expect(state.challenge?.violation?.snapshot).toBeDefined();

    const wire = JSON.stringify(hiddenView(state, "b"));
    expect(wire).not.toContain("snapshot");
    expect(wire).not.toContain("violation");
    expect(wire).not.toContain("challenge");
    // b's own hand is fine; a's must not be there.
    expect(wire).toContain("9H#1");
    expect(wire).not.toContain("5H#1");
  });

  it("hides which card someone drew, but not that they drew", () => {
    const event = { type: "drew", playerId: "a", card: { id: "KD#1", rank: "K", suit: "D" } } as const;
    expect(redactEvent(event, "b", { handsVisible: false })).toEqual({
      type: "drew",
      playerId: "a",
      card: null,
    });
    expect(redactEvent(event, "a", { handsVisible: false })).toEqual(event);
    expect(redactEvent(event, "b", { handsVisible: true })).toEqual(event);
  });
});

describe("with hands up", () => {
  it("shows everything, because that is the point of the mode", () => {
    const state = startGame(["a", "b", "c"], 42);
    const view = redact(state, "a", { handsVisible: true });
    for (const player of view.players) expect(player.hand).toHaveLength(5);
  });

  it("still keeps the challenge to itself", () => {
    const state = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["KD"] }),
      "a",
    );
    const wire = JSON.stringify(redact(state, "b", { handsVisible: true }));
    expect(wire).not.toContain("violation");
    expect(wire).not.toContain("snapshot");
  });
});

describe("the Sunny button", () => {
  it("looks exactly the same whether or not the draw was legal", () => {
    const guilty = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["KD"] }),
      "a",
    );
    const innocent = draw(
      table({ hands: { a: ["2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    for (const state of [guilty, innocent]) {
      const view = hiddenView(state, "b");
      expect(view.sunnyCallable).toBe(true);
      expect(view.sunnyTargetId).toBe("a");
    }
  });

  it("isn't offered to the drawer, or to anyone once the window shuts", () => {
    const state = draw(
      table({ hands: { a: ["2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    expect(state.status).toBe("playing");
    expect(hiddenView(state, "a").sunnyCallable).toBe(false);

    const fresh = table({ hands: { a: ["5H"], b: ["9H"], c: ["4D"] }, top: "5S" });
    expect(hiddenView(fresh, "b").sunnyCallable).toBe(false);
  });

  it("isn't offered to a spectator, who holds no cards to lose", () => {
    const state = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] }, top: "5S", drawPile: ["KD"] }),
      "a",
    );
    const view = redact(state, null, { handsVisible: false });
    expect(view.you).toBeNull();
    expect(view.sunnyCallable).toBe(false);
    expect(view.legalCardIds).toEqual([]);
  });
});

describe("what the table can always see", () => {
  it("includes the disposal pile, which is face up by the rules", () => {
    const state = table({
      hands: { a: ["5H"], b: ["9H"], c: ["4D"] },
      top: "5S",
      disposalPile: ["KC", "QC"],
    });
    expect(hiddenView(state, "a").disposalPile.map((c) => c.id)).toEqual(["KC#1", "QC#1"]);
  });

  it("names who the game is waiting on, even mid-punishment", () => {
    const state = table({ hands: { a: ["5H"], b: ["9H"], c: ["4D"] }, top: "5S" });
    expect(hiddenView(state, "c").waitingOn).toBe("a");

    const disposing: GameState = {
      ...state,
      phase: { kind: "disposal", playerId: "b", reason: "sunnyBadCall", resume: { kind: "action" } },
    };
    const view = hiddenView(disposing, "c");
    expect(view.waitingOn).toBe("b");
    expect(view.phase).toEqual({ kind: "disposal", playerId: "b", reason: "sunnyBadCall" });
  });
});
