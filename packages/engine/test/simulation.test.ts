import { describe, expect, it } from "vitest";

import {
  MAX_DRAWS_PER_TURN,
  applyIntent,
  decideBotIntent,
  legalCards,
  nextSeed,
  playerById,
  randomInt,
  redact,
  startGame,
  type GameEvent,
  type GameState,
  type Intent,
  type PlayerId,
} from "../src/index.ts";
import { allCardIds } from "./helpers.ts";

interface RunOptions {
  players: number;
  seed: number;
  /** Chance in a hundred that a bot draws on purpose while holding a play. */
  mischief?: number;
  handsVisible?: boolean;
  stepCap?: number;
}

interface RunResult {
  state: GameState;
  steps: number;
  events: GameEvent[];
  sunnyCalls: number;
  correctCalls: number;
}

const waitingOn = (state: GameState): PlayerId | null => {
  if (state.phase.kind === "over") return null;
  if (state.phase.kind === "disposal") return state.phase.playerId;
  return state.players[state.turnIndex]?.id ?? null;
};

/**
 * Plays a whole game out with bots, checking the invariants after every intent
 * rather than only at the end — a rule broken three hundred moves in is
 * otherwise indistinguishable from one broken on move one.
 */
const runGame = ({
  players,
  seed,
  mischief = 0,
  handsVisible = false,
  stepCap = 5000,
}: RunOptions): RunResult => {
  const ids: PlayerId[] = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  let state = startGame(ids, seed);
  const total = allCardIds(state).length;
  const events: GameEvent[] = [];
  let rng = nextSeed(seed);
  let steps = 0;
  let sunnyCalls = 0;
  let correctCalls = 0;

  /** The bots follow the rules; only the harness breaks them on purpose. */
  const nextMove = (): { intent: Intent; deliberateFoul: boolean } | null => {
    const waiting = waitingOn(state);
    const canStillDraw = state.drawsThisTurn < MAX_DRAWS_PER_TURN;
    if (mischief > 0 && state.phase.kind === "action" && waiting !== null && canStillDraw) {
      const player = playerById(state, waiting);
      const [roll, next] = randomInt(rng, 100);
      rng = next;
      if (player && roll < mischief && legalCards(state, player).length > 0) {
        return { intent: { type: "drawCard", playerId: player.id }, deliberateFoul: true };
      }
    }
    // Everyone gets a look in, so Sunny calls come from wherever they come.
    for (const player of state.players) {
      const view = redact(state, player.id, { handsVisible });
      const [intent, next] = decideBotIntent(view, rng);
      rng = next;
      if (intent) return { intent, deliberateFoul: false };
    }
    return null;
  };

  while (state.status === "playing" && steps < stepCap) {
    const move = nextMove();
    if (!move) break;
    steps += 1;

    const before = state;
    const result = applyIntent(state, move.intent);
    expect(
      result.ok,
      `rejected ${JSON.stringify(move.intent)}: ${result.ok ? "" : result.error}`,
    ).toBe(true);
    if (!result.ok) break;
    state = result.state;
    events.push(...result.events);

    for (const event of result.events) {
      if (event.type !== "sunnyCalled") continue;
      sunnyCalls += 1;
      if (event.correct) correctCalls += 1;
    }

    const present = allCardIds(state);
    expect(present, `a card was lost or duplicated by ${move.intent.type}`).toHaveLength(total);
    expect(new Set(present).size).toBe(total);

    // If you can play, you must: an honest draw is only ever made from a hand
    // with nothing playable in it.
    if (move.intent.type === "drawCard" && !move.deliberateFoul) {
      const player = playerById(before, move.intent.playerId);
      expect(player && legalCards(before, player), "a bot drew while holding a play").toHaveLength(
        0,
      );
    }

    if (state.status === "playing" && state.phase.kind === "action") {
      expect(
        state.players[state.turnIndex]?.eliminated,
        "an eliminated player was handed a turn",
      ).toBe(false);
    }
    if (state.status === "over") expect(state.phase.kind).toBe("over");
  }

  return { state, steps, events, sunnyCalls, correctCalls };
};

describe("full games", () => {
  it("finish, with one winner still holding cards", () => {
    for (const players of [3, 4, 5, 6]) {
      for (let seed = 1; seed <= 12; seed++) {
        const { state, steps } = runGame({ players, seed: seed * 7919 });
        expect(state.status, `${players} players, seed ${seed}: unfinished after ${steps}`).toBe(
          "over",
        );
        const survivors = state.players.filter((p) => !p.eliminated);
        expect(survivors).toHaveLength(1);
        expect(state.winnerId).toBe(survivors[0]?.id);
        expect(survivors[0]?.hand.length).toBeGreaterThan(0);
      }
    }
  });

  it("finish with the Sunny Rule in play, right calls and wrong ones", () => {
    let calls = 0;
    let correct = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const run = runGame({ players: 4, seed: seed * 104729, mischief: 25 });
      expect(run.state.status).toBe("over");
      calls += run.sunnyCalls;
      correct += run.correctCalls;
    }
    // Both outcomes have to actually occur, or the run proved nothing.
    expect(calls).toBeGreaterThan(0);
    expect(correct).toBeGreaterThan(0);
    expect(calls - correct).toBeGreaterThan(0);
  });

  it("play out identically from the same seed", () => {
    const first = runGame({ players: 4, seed: 2024, mischief: 20 });
    const second = runGame({ players: 4, seed: 2024, mischief: 20 });
    expect(second.state).toEqual(first.state);
    expect(second.events).toEqual(first.events);
  });

  it("are playable from the redacted view alone, hands up or down", () => {
    // The bots see only what a browser sees. A game that plays out this way is
    // a game whose view carries everything the client needs.
    for (const handsVisible of [true, false]) {
      const { state } = runGame({ players: 5, seed: 8675309, handsVisible, mischief: 15 });
      expect(state.status).toBe("over");
    }
  });
});
