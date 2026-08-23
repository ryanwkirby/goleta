import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPTIONS,
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
  type GameOptions,
  type PlayerId,
} from "../src/index.ts";
import { allCardIds } from "./helpers.ts";

interface RunOptions {
  players: number;
  seed: number;
  /** Chance in a hundred that a bot draws on purpose while holding a play. */
  mischief?: number;
  /** Chance in a hundred that a drawn-out turn is ended on purpose while holding
   * a play (#260) — the second way to commit the Sunny offence, and the one a
   * bot never commits. */
  bluff?: number;
  /** Chance in a hundred of an accusation on spec. Bots only call violations they
   * have caught, so a wrong call has to be made deliberately. */
  slander?: number;
  stepCap?: number;
  /** The house rules to play under. Defaults to the game as written. */
  options?: GameOptions;
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
  /** Turns the harness ended dishonestly, which is the position #260 is about. */
  bluffs: number;
}

const waitingOn = (state: GameState): PlayerId | null => {
  if (state.phase.kind === "over") return null;
  if (state.phase.kind === "surrender") return state.phase.playerId;
  // A suit is owed by a named player, who under Power of Eights is not the player
  // to move. Kept in step with `redact.ts`'s copy.
  if (state.phase.kind === "suit") return state.phase.playerId;
  return state.players[state.turnIndex]?.id ?? null;
};

/**
 * Checks the invariants after every intent rather than only at the end — a rule
 * broken three hundred moves in is otherwise indistinguishable from one broken
 * on move one.
 */
const runGame = ({
  players,
  seed,
  mischief = 0,
  bluff = 0,
  slander = 0,
  stepCap = 5000,
  options = DEFAULT_OPTIONS,
}: RunOptions): RunResult => {
  const ids: PlayerId[] = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  let state = startGame(ids, seed, options);
  const total = allCardIds(state).length;
  const events: GameEvent[] = [];
  let rng = nextSeed(seed);
  let steps = 0;
  let sunnyCalls = 0;
  let correctCalls = 0;
  let botCalls = 0;
  let wrongBotCalls = 0;
  let bluffs = 0;

  /** Rolled once and remembered, the same bargain the server strikes. */
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

    // "I'm done" pressed on a hand that has something playable in it (#260). It is
    // a lie and the engine permits it silently, exactly as it permits a reach for
    // the deck — and it is the second way to commit the offence.
    if (bluff > 0 && state.phase.kind === "action" && waiting !== null && !canStillDraw) {
      const player = playerById(state, waiting);
      const [roll, next] = randomInt(rng, 100);
      rng = next;
      if (player && roll < bluff && legalCards(state, player).length > 0) {
        return {
          intent: { type: "endTurn", playerId: player.id },
          deliberateFoul: true,
          fromBot: false,
        };
      }
    }

    // An accusation thrown without looking, which is the only way a wrong one gets
    // made now: it names whatever card comes to hand rather than a legal one.
    const challenge = state.challenge;
    if (slander > 0 && challenge && !challenge.resolved) {
      const [roll, next] = randomInt(rng, 100);
      rng = next;
      const accuser = state.players.find(
        (p) =>
          !p.eliminated &&
          p.id !== challenge.drawerId &&
          (state.sunnyLockouts[p.id] ?? 0) <= state.totalReaches,
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
    if (move.intent.type === "endTurn" && move.deliberateFoul) bluffs += 1;

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

    // If you can play, you must: an honest draw — or an honest end to a turn —
    // comes only from a hand with nothing playable in it. Bots never break this;
    // only the harness does, on purpose.
    if (
      (move.intent.type === "drawCard" || move.intent.type === "endTurn") &&
      !move.deliberateFoul
    ) {
      const player = playerById(before, move.intent.playerId);
      expect(
        player && legalCards(before, player),
        `a bot ${move.intent.type === "drawCard" ? "drew" : "ended its turn"} while holding a play`,
      ).toHaveLength(0);
    }

    // A card turned up off the deck is natural, 8 or not.
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

  return { state, steps, events, sunnyCalls, correctCalls, botCalls, wrongBotCalls, bluffs };
};

describe("full games", () => {
  it("finish, with one winner still holding cards", () => {
    for (const players of [4, 5, 6, 7, 8]) {
      for (let seed = 1; seed <= 12; seed++) {
        const { state, steps, events } = runGame({ players, seed: seed * 7919 });
        expect(state.status, `${players} players, seed ${seed}: unfinished after ${steps}`).toBe(
          "over",
        );
        // One deck puts fewer cards in circulation than two, so the deadlock safeguard
        // is closer to reach. It should still never fire.
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
    // But a bot is never the one who got it wrong: it accuses only somebody it has
    // caught, so every call of its own lands.
    expect(botCalls).toBeGreaterThan(0);
    expect(wrongBotCalls, "a bot accused an innocent player").toBe(0);
    // As do both ways a card comes off the deck.
    expect(turnUps.sunnyTouched).toBeGreaterThan(0);
    expect(turnUps.recycle).toBeGreaterThan(0);
  });

  /**
   * The second way to commit the offence (#260). The turn no longer ends itself
   * after a third fruitless draw, so **I'm done** can be pressed on a hand with
   * a play in it — a lie the engine permits silently, exactly as it permits a
   * reach for the deck.
   *
   * The three invariants have to survive it, and the interesting one is *forced
   * play is never skipped*: this is the second control that lets a **player**
   * break it while the bots never do.
   */
  it("finish when players end drawn-out turns dishonestly", () => {
    let bluffs = 0;
    let calls = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const run = runGame({ players: 4, seed: seed * 15485863, bluff: 90, slander: 4 });
      expect(run.state.status, `seed ${seed}: unfinished after ${run.steps}`).toBe("over");
      expect(run.state.winnerId).not.toBeNull();
      bluffs += run.bluffs;
      calls += run.sunnyCalls;
    }
    // The runs have to have actually reached the position — a drawn-out turn
    // holding a play — or they proved nothing.
    expect(bluffs).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(0);
  });

  it("play out identically from the same seed", () => {
    const first = runGame({ players: 4, seed: 2024, mischief: 20 });
    const second = runGame({ players: 4, seed: 2024, mischief: 20 });
    expect(second.state).toEqual(first.state);
    expect(second.events).toEqual(first.events);
  });

  /**
   * The safety net the options system rests on. The three invariants say nothing
   * about *which* rules are in play, so they hold a variant to the same standard
   * as the game as written.
   */
  it("finish under every combination of house rules", () => {
    const matrix: GameOptions[] = [];
    for (const eights of ["playerNames", "nextPlayerNames"] as const) {
      for (const seedEight of ["natural", "dealerNames"] as const) {
        for (const sunny of [DEFAULT_OPTIONS.sunny, null]) {
          matrix.push({ ...DEFAULT_OPTIONS, eights, seedEight, sunny });
        }
      }
    }
    expect(matrix).toHaveLength(8);

    for (const options of matrix) {
      const label = `${options.eights}/${options.seedEight}/sunny=${options.sunny !== null}`;
      for (let seed = 1; seed <= 6; seed++) {
        // Mischief on throughout: with the Sunny Rule off an illegal draw is just a
        // legal one nobody can say anything about, and the game still has to end.
        const run = runGame({ players: 4, seed: seed * 31337, mischief: 25, slander: 4, options });
        expect(run.state.status, `${label}, seed ${seed}: unfinished`).toBe("over");
        const survivors = run.state.players.filter((p) => !p.eliminated);
        expect(survivors, `${label}, seed ${seed}`).toHaveLength(1);

        // With the rule off, none of its machinery may so much as stir.
        if (options.sunny === null) {
          expect(run.sunnyCalls, `${label}: a call landed with the rule off`).toBe(0);
          expect(run.state.challenge, `${label}: a window opened with the rule off`).toBeNull();
          expect(run.state.totalReaches, `${label}: reaches counted with the rule off`).toBe(0);
        }
      }
    }
  });

  it("are playable from the redacted view alone", () => {
    // The bots see only what a browser sees, so a game that plays out this way is a
    // game whose view carries everything the client needs.
    const { state } = runGame({ players: 5, seed: 8675309, mischief: 15 });
    expect(state.status).toBe("over");
  });
});
