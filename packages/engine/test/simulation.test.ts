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
  rollSunnyCall,
  startGame,
  type CardId,
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
  /**
   * Chance in a hundred that somebody accuses on spec. Bots only ever call a
   * violation they have actually caught, so a wrong call — and the resolution
   * that follows one — has to be made deliberately.
   */
  slander?: number;
  stepCap?: number;
}

interface RunResult {
  state: GameState;
  steps: number;
  events: GameEvent[];
  sunnyCalls: number;
  correctCalls: number;
  /** Calls a bot chose to make, as against the ones the harness forced. */
  botCalls: number;
  wrongBotCalls: number;
}

const waitingOn = (state: GameState): PlayerId | null => {
  if (state.phase.kind === "over") return null;
  if (state.phase.kind === "surrender") return state.phase.playerId;
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
  slander = 0,
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
  let botCalls = 0;
  let wrongBotCalls = 0;

  /**
   * The table's shared verdict on the violation in front of it, rolled once and
   * remembered — the same bargain the server strikes in `rooms.ts`.
   */
  let verdict: { drawerId: PlayerId; firstDrawnId: CardId | null; call: boolean } | null = null;
  const tableCallsSunny = (): boolean => {
    const challenge = state.challenge;
    if (!challenge || challenge.resolved || challenge.violation === null) {
      verdict = null;
      return false;
    }
    const firstDrawnId = challenge.drawnIds[0] ?? null;
    if (verdict && verdict.drawerId === challenge.drawerId && verdict.firstDrawnId === firstDrawnId) {
      return verdict.call;
    }
    const [call, next] = rollSunnyCall(rng);
    rng = next;
    verdict = { drawerId: challenge.drawerId, firstDrawnId, call };
    return call;
  };

  /** The bots follow the rules; only the harness breaks them on purpose. */
  const nextMove = (): { intent: Intent; deliberateFoul: boolean; fromBot: boolean } | null => {
    const waiting = waitingOn(state);
    const canStillDraw = state.drawsThisTurn < MAX_DRAWS_PER_TURN;
    if (mischief > 0 && state.phase.kind === "action" && waiting !== null && canStillDraw) {
      const player = playerById(state, waiting);
      const [roll, next] = randomInt(rng, 100);
      rng = next;
      if (player && roll < mischief && legalCards(state, player).length > 0) {
        return {
          intent: { type: "drawCard", playerId: player.id },
          deliberateFoul: true,
          fromBot: false,
        };
      }
    }

    // An accusation thrown without looking, which is the only way a wrong one
    // ever gets made now. It names whatever card comes to hand rather than a
    // legal one — that's what makes it slander rather than a real catch.
    const challenge = state.challenge;
    if (slander > 0 && challenge && !challenge.resolved) {
      const [roll, next] = randomInt(rng, 100);
      rng = next;
      const accuser = state.players.find(
        (p) =>
          !p.eliminated &&
          p.id !== challenge.drawerId &&
          (state.sunnyLockouts[p.id] ?? 0) <= state.totalDraws,
      );
      const accused = challenge.reach.hand[0];
      if (roll < slander && accuser && accused) {
        return {
          intent: { type: "callSunny", playerId: accuser.id, cardId: accused.id },
          deliberateFoul: false,
          fromBot: false,
        };
      }
    }

    // Everyone gets a look in, so Sunny calls come from wherever they come.
    const callSunny = tableCallsSunny();
    for (const player of state.players) {
      const intent = decideBotIntent(redact(state, player.id), { callSunny });
      if (intent) return { intent, deliberateFoul: false, fromBot: true };
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
      if (!move.fromBot) continue;
      botCalls += 1;
      if (!event.correct) wrongBotCalls += 1;
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

    // A card turned up off the deck is natural, 8 or not: the suit to match is
    // always the one printed on it, and nobody is ever asked to name another.
    for (const event of result.events) {
      if (event.type !== "turnedUp") continue;
      const last = event.cards[event.cards.length - 1];
      expect(state.activeSuit, "a turned-up card didn't set the suit").toBe(last?.suit);
    }
    if (result.events.some((event) => event.type === "turnedUp")) {
      expect(state.phase.kind, "turning a card up asked for a suit").not.toBe("suit");
    }

    if (state.status === "playing" && state.phase.kind === "action") {
      expect(
        state.players[state.turnIndex]?.eliminated,
        "an eliminated player was handed a turn",
      ).toBe(false);
    }
    if (state.status === "over") expect(state.phase.kind).toBe("over");
  }

  return { state, steps, events, sunnyCalls, correctCalls, botCalls, wrongBotCalls };
};

describe("full games", () => {
  it("finish, with one winner still holding cards", () => {
    for (const players of [4, 5, 6, 7, 8]) {
      for (let seed = 1; seed <= 12; seed++) {
        const { state, steps, events } = runGame({ players, seed: seed * 7919 });
        expect(state.status, `${players} players, seed ${seed}: unfinished after ${steps}`).toBe(
          "over",
        );
        // One 52-card deck puts fewer cards in circulation than two used to, so
        // the deadlock safeguard is closer to reach. It should still never fire.
        const over = events.findLast((event) => event.type === "gameOver");
        expect(over, `${players} players, seed ${seed}`).toMatchObject({ reason: "lastStanding" });
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
    let botCalls = 0;
    let wrongBotCalls = 0;
    const turnUps = { recycle: 0, sunnyTouched: 0 };
    for (let seed = 1; seed <= 25; seed++) {
      const run = runGame({ players: 4, seed: seed * 104729, mischief: 25, slander: 4 });
      expect(run.state.status).toBe("over");
      calls += run.sunnyCalls;
      correct += run.correctCalls;
      botCalls += run.botCalls;
      wrongBotCalls += run.wrongBotCalls;
      for (const event of run.events) {
        if (event.type === "turnedUp") turnUps[event.reason] += 1;
      }
    }
    // Both outcomes have to actually occur, or the run proved nothing.
    expect(calls).toBeGreaterThan(0);
    expect(correct).toBeGreaterThan(0);
    expect(calls - correct).toBeGreaterThan(0);
    // But a bot is never the one who got it wrong: it accuses only somebody it
    // has caught, so every call of its own lands.
    expect(botCalls).toBeGreaterThan(0);
    expect(wrongBotCalls, "a bot accused an innocent player").toBe(0);
    // As do both ways a card comes off the deck.
    expect(turnUps.sunnyTouched).toBeGreaterThan(0);
    expect(turnUps.recycle).toBeGreaterThan(0);
  });

  it("play out identically from the same seed", () => {
    const first = runGame({ players: 4, seed: 2024, mischief: 20 });
    const second = runGame({ players: 4, seed: 2024, mischief: 20 });
    expect(second.state).toEqual(first.state);
    expect(second.events).toEqual(first.events);
  });

  it("are playable from the redacted view alone", () => {
    // The bots see only what a browser sees. A game that plays out this way is
    // a game whose view carries everything the client needs.
    const { state } = runGame({ players: 5, seed: 8675309, mischief: 15 });
    expect(state.status).toBe("over");
  });
});
