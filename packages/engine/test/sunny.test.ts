import { describe, expect, it } from "vitest";

import {
  SUNNY_LOCKOUT_REACHES,
  applyIntent,
  currentPlayer,
  isPlayable,
  legalCards,
  topCard,
  type GameState,
  type SunnyEvidence,
} from "../src/index.ts";
import {
  allCardIds,
  card,
  cards,
  draw,
  handOf,
  must,
  pileFromTop,
  play,
  reject,
  surrender,
  table,
} from "./helpers.ts";

const call = (state: GameState, playerId: string, spec: string): GameState =>
  must(state, { type: "callSunny", playerId, cardId: card(spec).id });

/** The same call, judged for its evidence rather than for what it does. */
const evidenceOf = (state: GameState, callerId: string, spec: string): SunnyEvidence => {
  const intent = { type: "callSunny", playerId: callerId, cardId: card(spec).id } as const;
  const result = applyIntent(state, intent);
  if (!result.ok) throw new Error(result.error);
  const called = result.events.find((event) => event.type === "sunnyCalled");
  if (called?.type !== "sunnyCalled") throw new Error("no call was announced");
  return called.evidence;
};

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

/**
 * A reach that was an offence, then a recycle, then a reach that wasn't. A
 * recycle mid-turn is the one thing that can pull the reach an accusation is
 * judged against away from the reach that was the offence (#74).
 */
const acrossARecycle = (): GameState => {
  let state = table({
    hands: { a: ["5H"], b: ["2C"], c: ["3D"] },
    top: "3H",
    drawPile: ["2D"],
    buriedDiscards: ["KS", "QS", "JS", "9S", "7S", "6S"],
  });
  state = draw(state, "a"); // the offence: 5H was playable on the 3H
  state = draw(state, "a"); // deck empty, so this recycles and turns up a spade
  expect(topCard(state).suit).toBe("S");
  state = draw(state, "a"); // honest: nothing in hand plays on a spade
  return state;
};

describe("a correct call", () => {
  it("forces the skipped play, then a punishment, then turns up what they touched", () => {
    let state = caughtInTheAct();
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1", "KD#1"]);

    state = call(state, "b", "5H");
    // The rewind puts the drawn card back, so the play they dodged is owed first.
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1"]);
    expect(state.phase.kind).toBe("sunnyPlay");
    expect(reject(state, { type: "drawCard", playerId: "a" })).toMatch(/Can't draw/);

    state = play(state, "a", "5H");
    expect(state.phase).toMatchObject({
      kind: "surrender",
      playerId: "a",
      reason: "sunnyPunishment",
    });

    // Any card at all — legality is irrelevant to a card that is being lost.
    state = surrender(state, "a", "2C");

    // Skipped play, then the touched card on top of it. The punishment card is
    // not between them: since #364 it goes to the *bottom* of the pile (below
    // the 5S the game opened on), so it is never the card anybody matches.
    expect(pileFromTop(state).slice(0, 3)).toEqual(["KD#1", "5H#1", "5S#1"]);
    expect(pileFromTop(state).at(-1)).toBe("2C#1");
    expect(topCard(state).id).toBe("KD#1");
    expect(state.activeSuit).toBe("D");
    expect(handOf(state, "a")).toEqual([]);
    expect(currentPlayer(state).id).toBe("b");
    expect(allCardIds(state)).toHaveLength(7);
  });

  it("names the cards the rewind takes back, so the table can watch it happen", () => {
    const result = applyIntent(caughtInTheAct(), {
      type: "callSunny",
      playerId: "b",
      cardId: card("5H").id,
    });
    if (!result.ok) throw new Error(result.error);
    const called = result.events.find((event) => event.type === "sunnyCalled");
    expect(called).toMatchObject({ callerId: "b", targetId: "a", correct: true });
    expect(called?.type === "sunnyCalled" && called.returned.map((c) => c.id)).toEqual(["KD#1"]);
  });

  it("costs two cards from hand — and naming the card adds nothing to that", () => {
    let state = caughtInTheAct();
    state = call(state, "b", "5H");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");
    // Two cards at the start of the turn and none at the end: the skipped play and
    // the punishment. Naming the card correctly adds nothing.
    expect(handOf(state, "a")).toEqual([]);
  });

  it("lets only the caught player choose the punishment card", () => {
    let state = call(caughtInTheAct(), "b", "5H");
    state = play(state, "a", "5H");
    expect(reject(state, { type: "surrenderCard", playerId: "b", cardId: "9H#1" })).toMatch(
      /Not your card to give up/,
    );
    expect(reject(state, { type: "surrenderCard", playerId: "a", cardId: "9H#1" })).toMatch(
      /Not in your hand/,
    );
  });

  it("turns up the second card only, when the first draw was honest", () => {
    // 2C can't be played on 5S, so the first draw is fine. It turns up a 7S, which
    // can be — and drawing again is the offence.
    let state = table({
      hands: { a: ["2C"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: ["QD", "KD", "7S"],
    });
    state = draw(state, "a");
    expect(state.challenge?.violation).toBeNull();
    state = draw(state, "a");

    // The 7S they drew honestly is what they're now accused of skipping.
    state = call(state, "b", "7S");
    expect(handOf(state, "a")).toEqual(["2C#1", "7S#1"]);
    state = play(state, "a", "7S");
    state = surrender(state, "a", "2C");
    expect(topCard(state).id).toBe("KD#1");
    expect(pileFromTop(state).slice(0, 3)).toEqual(["KD#1", "7S#1", "5S#1"]);
    expect(pileFromTop(state).at(-1)).toBe("2C#1");
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

    // Still nameable, even though their hand has since picked up cards that aren't.
    state = call(state, "b", "5H");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");
    expect(pileFromTop(state).slice(0, 4)).toEqual(["KD#1", "3H#1", "5H#1", "5S#1"]);
    expect(pileFromTop(state).at(-1)).toBe("2C#1");
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
    state = call(state, "b", "5H");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");

    expect(topCard(state).id).toBe("8D#1");
    // Its own suit, and nobody was asked to name one.
    expect(state.activeSuit).toBe("D");
    expect(state.phase.kind).toBe("action");
    expect(currentPlayer(state).id).toBe("b");
  });

  it("does not stop to name a suit for an 8 played during the resolution", () => {
    // The touched card lands on top a moment later, erasing anything named.
    let state = draw(
      table({
        hands: { a: ["8C", "2C"], b: ["9C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
      }),
      "a",
    );
    // A wild is always legal, so accusing it is always a correct call.
    state = call(state, "b", "8C");
    state = play(state, "a", "8C");
    expect(state.phase).toMatchObject({ kind: "surrender", reason: "sunnyPunishment" });

    state = surrender(state, "a", "2C");
    expect(topCard(state).id).toBe("KD#1");
    expect(state.activeSuit).toBe("D");
  });
});

describe("naming the card", () => {
  it("must be a card the offender actually held before the draw", () => {
    const state = caughtInTheAct();
    expect(reject(state, { type: "callSunny", playerId: "b", cardId: card("9H").id })).toMatch(
      /They didn't hold it/,
    );
  });

  it("cannot be any card the offence itself put in their hand", () => {
    // a is caught on the first draw and reaches again before anyone calls it.
    // Neither drawn card is ever an option: both arrived after the offence.
    let state = caughtInTheAct();
    const firstDrawId = handOf(state, "a").at(-1) as string;
    state = draw(state, "a");
    const secondDrawId = handOf(state, "a").at(-1) as string;

    for (const drawn of [firstDrawId, secondDrawId]) {
      expect(reject(state, { type: "callSunny", playerId: "b", cardId: drawn })).toMatch(
        /They didn't hold it/,
      );
    }

    const reachIds = state.challenge?.reach.hand.map((c) => c.id);
    expect(reachIds).toEqual(["5H#1", "2C#1"]);
    expect(state.challenge?.resolved).toBe(false);
    state = call(state, "b", "5H");
    expect(state.phase.kind).toBe("sunnyPlay");
  });

  it("counts any legal card as correct, leaving the choice of which to play to the offender", () => {
    // Both 5H and 4S are legal against 5S, and naming either lands the call.
    let state = draw(
      table({
        hands: { a: ["5H", "4S"], b: ["9C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
      }),
      "a",
    );
    state = call(state, "b", "4S");
    expect(state.phase.kind).toBe("sunnyPlay");
    expect(reject(state, { type: "playCard", playerId: "a", cardId: card("KD").id })).toBeTruthy();
    state = play(state, "a", "5H");
    expect(handOf(state, "a")).toEqual(["4S#1"]);
  });
});

describe("a wrong call", () => {
  it("changes nothing about the position — no card lost by either side", () => {
    // 2C and 4H are both dead against the 5S, so drawing is entirely honest.
    let state = draw(
      table({
        hands: { a: ["2C", "4H"], b: ["9C", "10C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
      }),
      "a",
    );
    const result = applyIntent(state, {
      type: "callSunny",
      playerId: "b",
      cardId: card("2C").id,
    });
    if (!result.ok) throw new Error(result.error);
    const called = result.events.find((event) => event.type === "sunnyCalled");
    expect(called?.type === "sunnyCalled" && called.returned).toEqual([]);

    state = call(state, "b", "2C");

    expect(state.challenge?.resolved).toBe(true);
    expect(handOf(state, "b")).toEqual(["9C#1", "10C#1"]);
    expect(topCard(state).id).toBe("5S#1");
    expect(state.activeSuit).toBe("S");
    expect(currentPlayer(state).id).toBe("a");
    expect(handOf(state, "a")).toEqual(["2C#1", "4H#1", "KD#1"]);
    expect(state.phase.kind).toBe("action");
  });

  it("names the card that was wrongly accused, in the event", () => {
    const state = draw(
      table({ hands: { a: ["2C"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    const result = applyIntent(state, { type: "callSunny", playerId: "b", cardId: card("2C").id });
    if (!result.ok) throw new Error(result.error);
    expect(result.events).toContainEqual({
      type: "sunnyCalled",
      callerId: "b",
      targetId: "a",
      card: card("2C"),
      correct: false,
      returned: [],
      // The same evidence a landed call shows: the table reads the verdict off the
      // two cards rather than off the wording.
      evidence: { inPlay: card("5S"), activeSuit: "S", since: [] },
      // And no offence named. There was no violation behind this one, but there
      // can be — see the test below (#363).
      via: null,
    });
  });

  it("names no offence on a call that missed, even when there was one to catch", () => {
    // `a` holds a playable 5H and reaches anyway, so a violation is on the state.
    // `b` names the 2C, which was never legal, so the call is wrong. Saying
    // *which* offence it was here would tell a caller who has just been told they
    // were wrong that there was something to catch — the tell #50 removed.
    const state = caughtInTheAct();
    expect(state.challenge?.violation).not.toBeNull();

    const result = applyIntent(state, { type: "callSunny", playerId: "b", cardId: card("2C").id });
    if (!result.ok) throw new Error(result.error);
    const called = result.events.find((event) => event.type === "sunnyCalled");
    expect(called).toMatchObject({ correct: false, via: null });
  });

  it("locks the caller out until three more reaches happen at the table", () => {
    let state = draw(
      table({ hands: { a: ["2C"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD", "3D"] }),
      "a",
    );
    state = call(state, "b", "2C");
    expect(state.sunnyLockouts.b).toBe(state.totalReaches + SUNNY_LOCKOUT_REACHES);

    // The lockout counts draws at the table, not whether the window is open.
    state = draw(state, "a");
    expect(reject(state, { type: "callSunny", playerId: "b", cardId: card("2C").id })).toMatch(
      /Locked out/,
    );
    const result = applyIntent(state, { type: "callSunny", playerId: "c", cardId: card("2C").id });
    expect(result.ok).toBe(true);
  });

  it("lifts once totalReaches has advanced by three, not before", () => {
    const base = table({ hands: { a: ["2C"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD"] });
    const locked: GameState = {
      ...base,
      challenge: {
        drawerId: "a",
        drawnIds: [],
        reach: { hand: cards("2C"), activeSuit: "S", topRank: "5" },
        reachPile: { inPlay: card("5S"), ids: [card("5S").id] },
        violation: null,
        resolved: false,
      },
      totalReaches: 10,
      sunnyLockouts: { b: 13 },
    };

    expect(reject(locked, { type: "callSunny", playerId: "b", cardId: card("2C").id })).toMatch(
      /Locked out/,
    );
    const stillLocked = { ...locked, totalReaches: 12 };
    expect(
      reject(stillLocked, { type: "callSunny", playerId: "b", cardId: card("2C").id }),
    ).toMatch(/Locked out/);
    const free = { ...locked, totalReaches: 13 };
    expect(applyIntent(free, { type: "callSunny", playerId: "b", cardId: card("2C").id }).ok).toBe(
      true,
    );
  });

  it("survives the rewind a later correct call performs", () => {
    // The rewind restores a whole cloned `GameState`, and lockouts live on it.
    // Restoring them wholesale would refund a wrong call made *before* the
    // snapshot — `handleCallSunny` carries the two counters across by hand.
    let state = draw(
      table({
        hands: { a: ["5H", "2C"], b: ["9C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
      }),
      "a",
    );
    // b names the 2C, which was dead against the 5S. A miss.
    state = call(state, "b", "2C");
    expect(state.sunnyLockouts.b).toBe(SUNNY_LOCKOUT_REACHES + 1);

    // c names the 5H, which really was playable, rewinding past b's miss.
    state = draw(state, "a");
    state = call(state, "c", "5H");
    expect(state.phase.kind).toBe("sunnyPlay");

    // b's miss stands, and the draws served against it weren't handed back.
    expect(state.totalReaches).toBe(2);
    expect(state.sunnyLockouts.b).toBe(SUNNY_LOCKOUT_REACHES + 1);
  });

  it("is per caller: someone else's lockout doesn't apply to you", () => {
    let state = draw(
      table({ hands: { a: ["2C"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD", "3D"] }),
      "a",
    );
    state = call(state, "b", "2C");
    state = draw(state, "a");
    const result = applyIntent(state, { type: "callSunny", playerId: "c", cardId: card("2C").id });
    expect(result.ok).toBe(true);
  });
});

describe("a call that lands after the fact", () => {
  it("rewinds a card the drawer has already played", () => {
    let state = play(caughtInTheAct(), "a", "5H");
    expect(currentPlayer(state).id).toBe("b");

    state = call(state, "b", "5H");
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

    state = call(state, "b", "8C");
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

    state = call(state, "b", "8C");
    expect(state.phase.kind).toBe("sunnyPlay");
    expect(topCard(state).id).toBe("5S#1");
  });

  it("closes the moment the next player acts", () => {
    let state = play(caughtInTheAct(), "a", "5H");
    state = play(state, "b", "9H");
    expect(
      reject(state, { type: "callSunny", playerId: "c", cardId: card("5H").id }),
    ).toMatch(/Nothing to call/);
  });
});

describe("who may call, and when", () => {
  it("is nobody, before anyone has drawn", () => {
    const state = table({ hands: { a: ["5H"], b: ["9C"], c: ["4D"] }, top: "5S" });
    expect(
      reject(state, { type: "callSunny", playerId: "b", cardId: card("5H").id }),
    ).toMatch(/Nothing to call/);
  });

  it("is not the drawer", () => {
    expect(
      reject(caughtInTheAct(), { type: "callSunny", playerId: "a", cardId: card("5H").id }),
    ).toMatch(/on yourself/);
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
    expect(
      reject(state, { type: "callSunny", playerId: "b", cardId: card("5H").id }),
    ).toMatch(/You're out/);
  });

  it("is only the first to speak", () => {
    const state = call(caughtInTheAct(), "b", "5H");
    expect(
      reject(state, { type: "callSunny", playerId: "c", cardId: card("5H").id }),
    ).toMatch(/Nothing to call/);
  });

  it("is only the first to speak, even when they were wrong", () => {
    let state = draw(
      table({ hands: { a: ["2C"], b: ["9C", "10C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b", "2C");
    expect(
      reject(state, { type: "callSunny", playerId: "c", cardId: card("2C").id }),
    ).toMatch(/Nothing to call/);
  });

  it("reopens on the next draw, so a second offence is still callable", () => {
    let state = draw(
      table({ hands: { a: ["2C"], b: ["9C", "10C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "7S"] }),
      "a",
    );
    state = call(state, "b", "2C");
    // The 7S they drew is playable, so drawing again is an offence in itself.
    state = draw(state, "a");
    expect(must(state, { type: "callSunny", playerId: "c", cardId: card("7S").id }).phase.kind).toBe(
      "sunnyPlay",
    );
  });
});

describe("a resolution that finishes a player", () => {
  it("skips the punishment when the forced play empties the hand", () => {
    // a is down to one card, and it's playable, so drawing is an offence.
    let state = draw(
      table({ hands: { a: ["5H"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b", "5H");
    state = play(state, "a", "5H");

    expect(state.players.find((p) => p.id === "a")?.eliminated).toBe(true);
    expect(topCard(state).id).toBe("KD#1");
    expect(currentPlayer(state).id).toBe("b");
    expect(state.status).toBe("playing");
  });

  it("ends the game when the forced play leaves one player standing", () => {
    let state = draw(
      table({ hands: { a: ["5H"], b: ["9C"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b", "5H");
    state = play(state, "a", "5H");
    expect(state.status).toBe("over");
    expect(state.winnerId).toBe("b");
  });

  it("ends the game when the punishment card leaves one player standing", () => {
    let state = draw(
      table({ hands: { a: ["5H", "2C"], b: ["9C"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    state = call(state, "b", "5H");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");
    expect(state.status).toBe("over");
    expect(state.winnerId).toBe("b");
  });
});

describe("a call that spans a recycle", () => {
  it("finds the touched cards wherever the rewind put them", () => {
    // The offending draw empties the deck; the tap after the recycle takes a card
    // that was in the face-up pile when the rewind snapshot was taken.
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

    state = call(state, "b", "5H");
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1"]);
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");

    expect(pileFromTop(state).slice(0, 2).toSorted()).toEqual(drawn.toSorted());
    expect(allCardIds(state)).toHaveLength(total);
    expect(new Set(allCardIds(state)).size).toBe(total);
  });

  it("still judges a call against the reach that was the offence", () => {
    const state = acrossARecycle();
    expect(state.challenge?.violation).not.toBeNull();

    // Judged against the 3H they reached from, not the spade now showing.
    expect(state.challenge?.reach.activeSuit).toBe("H");
    expect(state.challenge?.reach.topRank).toBe("3");

    const called = call(state, "b", "5H");
    expect(called.phase.kind).toBe("sunnyPlay");
    expect(called.sunnyLockouts["b"] ?? 0).toBe(0);
  });

  it("still keeps the cards the offence drew off the list", () => {
    const state = acrossARecycle();
    expect(state.challenge?.reach.hand.map((c) => c.id)).toEqual(["5H#1"]);
    expect(reject(state, { type: "callSunny", playerId: "b", cardId: card("2D").id })).toMatch(
      /They didn't hold it/,
    );
  });

  it("still locks out a caller who was genuinely wrong", () => {
    // a had nothing playable against the 3H, so there was never an offence.
    let state = table({
      hands: { a: ["5C"], b: ["2C"], c: ["3D"] },
      top: "3H",
      drawPile: ["2D"],
      buriedDiscards: ["KS", "QS", "JS", "9S", "7S", "6S"],
    });
    state = draw(state, "a");
    state = draw(state, "a");
    state = draw(state, "a");
    expect(state.challenge?.violation).toBeNull();

    state = call(state, "b", "5C");
    expect(state.sunnyLockouts["b"]).toBeGreaterThan(state.totalReaches);
  });
});

describe("the challenge window", () => {
  it("never tells the caller whether a submitted accusation would land", () => {
    // Both games look identical from the outside, and 2C is dead against the 5S in
    // both. Acceptance of the intent never depends on the hidden verdict.
    const guilty = caughtInTheAct();
    const innocent = draw(
      table({ hands: { a: ["2C"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD"] }),
      "a",
    );
    for (const state of [guilty, innocent]) {
      expect(state.challenge?.drawerId).toBe("a");
      expect(state.challenge?.resolved).toBe(false);
      expect(
        applyIntent(state, { type: "callSunny", playerId: "b", cardId: card("2C").id }).ok,
      ).toBe(true);
    }
  });
});

describe("reaching for an empty deck", () => {
  it("is callable even though nothing was drawn", () => {
    // 5H plays on the 5S, and the deck being empty is no excuse.
    let state = table({
      hands: { a: ["5H", "2C"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: [],
      buriedDiscards: ["KH", "QH", "JH"],
    });
    const total = allCardIds(state).length;

    state = draw(state, "a");
    expect(state.drawsThisTurn).toBe(0);
    expect(state.challenge?.violation).not.toBeNull();
    expect(state.challenge?.violation?.touchedIds).toEqual([]);

    state = call(state, "b", "5H");
    expect(topCard(state).id).toBe("5S#1");
    expect(state.phase.kind).toBe("sunnyPlay");

    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");

    // Nothing touched to turn up, so the deck is answered the way an empty deck
    // always is. The punishment card is *not* left showing — that would let the
    // offender choose what the whole table matches next.
    expect(topCard(state).id).not.toBe("2C#1");
    expect(state.activeSuit).toBe(topCard(state).suit);
    expect(state.drawPile.length).toBeGreaterThan(0);

    expect(currentPlayer(state).id).toBe("b");
    // The recycle assigns the draw pile outright; this checks it never does so over
    // cards that were still in it.
    expect(allCardIds(state)).toHaveLength(total);
    expect(new Set(allCardIds(state)).size).toBe(total);
  });

  it("turns up a card nobody chose, rather than one the offender picked", () => {
    // `a` holds a card that would strand the table. Reaching at an empty deck must
    // not be a way to place it.
    let state = table({
      hands: { a: ["5H", "2C"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: [],
      buriedDiscards: ["KH", "QH", "JH"],
    });
    state = draw(state, "a");
    state = call(state, "b", "5H");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");

    // The 2C they chose is back in the shuffle with everything else, not on top.
    expect(state.drawPile.map((c) => c.id)).toContain("2C#1");
  });

  it("looks the same when the reach was honest, and just locks out a bad caller", () => {
    let state = table({
      hands: { a: ["2C"], b: ["9C", "10C"], c: ["4D"] },
      top: "5S",
      drawPile: [],
      buriedDiscards: ["KH", "QH"],
    });
    state = draw(state, "a");
    // Same shape of window as the guilty case; only the verdict differs.
    expect(state.challenge?.drawerId).toBe("a");
    expect(state.challenge?.violation).toBeNull();

    state = call(state, "b", "2C");
    expect(handOf(state, "b")).toEqual(["9C#1", "10C#1"]);
    expect(currentPlayer(state).id).toBe("a");
    expect(state.sunnyLockouts.b).toBeGreaterThan(0);
  });

  it("counts as a reach only when something actually came of it", () => {
    // Every card is in a hand, so nothing moves and no window opens — no beat for
    // anyone's lockout to count down against (#74).
    let state = table({
      hands: { a: ["5H"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: [],
    });
    state = draw(state, "a");
    expect(state.challenge).toBeNull();
    expect(state.totalReaches).toBe(0);

    // A reach that recycles the pile is still a reach: the window opens on it.
    let recycling = table({
      hands: { a: ["5H", "2C"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: [],
      buriedDiscards: ["KH", "QH", "JH"],
    });
    recycling = draw(recycling, "a");
    expect(recycling.challenge).not.toBeNull();
    expect(recycling.totalReaches).toBe(1);
  });
});

/**
 * What a judged call hands the table: the card in play at the reach, and
 * whatever landed on top since. Set the named card beside it and the verdict is
 * legible without anybody being told it (#63).
 */
describe("the evidence a judged call sends", () => {
  it("names the card that was in play when they reached, on a call that lands", () => {
    expect(evidenceOf(caughtInTheAct(), "b", "5H")).toEqual({
      inPlay: card("5S"),
      activeSuit: "S",
      since: [],
    });
  });

  it("sends the same shape for a call that missed", () => {
    // Both cards are dead against the 5S, so the call is wrong — and the table
    // still gets the pair, because what it should see is that they don't match.
    const honest = draw(
      table({
        hands: { a: ["2C", "4H"], b: ["9C", "10C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
      }),
      "a",
    );
    expect(evidenceOf(honest, "b", "2C")).toEqual({
      inPlay: card("5S"),
      activeSuit: "S",
      since: [],
    });
  });

  it("peels back past what the offender played after the offence", () => {
    // The accused card is now in the pile rather than the hand, and the evidence
    // has to say where.
    let state = caughtInTheAct();
    state = play(state, "a", "5H");
    expect(topCard(state).id).toBe("5H#1");

    const evidence = evidenceOf(state, "b", "5H");
    expect(evidence.inPlay).toEqual(card("5S"));
    expect(evidence.since.map((c) => c.id)).toEqual(["5H#1"]);
  });

  it("describes the board as it was, not as a wild 8 has since left it", () => {
    // An 8 played over the offence renames the suit. The evidence is the position
    // the accusation is judged against, so it is the spade that was in play.
    let state = draw(
      table({
        hands: { a: ["5H", "8C"], b: ["9C"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
      }),
      "a",
    );
    state = play(state, "a", "8C");
    state = must(state, { type: "chooseSuit", playerId: "a", suit: "D" });
    expect(state.activeSuit).toBe("D");

    expect(evidenceOf(state, "b", "5H")).toEqual({
      inPlay: card("5S"),
      activeSuit: "S",
      since: cards("8C"),
    });
  });

  it("says nothing about what is buried under the pile, or in the deck", () => {
    const state = draw(
      table({
        hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] },
        top: "5S",
        drawPile: ["QD", "KD"],
        buriedDiscards: ["KC", "QC"],
      }),
      "a",
    );
    const wire = JSON.stringify(evidenceOf(state, "b", "5H"));
    // Only the card in play, never the pile under it.
    expect(wire).not.toMatch(/KC#1|QC#1/);
    // And nothing from the deck: `KD#1` is what the offender drew, `QD#1` the next.
    expect(wire).not.toMatch(/KD#1|QD#1/);
  });

  it("is built fresh for each call rather than kept on the state", () => {
    // The pile at the reach, frozen with the reach, and nothing shaped like an answer.
    const state = caughtInTheAct();
    expect(state.challenge?.reachPile).toEqual({ inPlay: card("5S"), ids: ["5S#1"] });
    expect(JSON.stringify(state.challenge)).not.toContain("evidence");
  });
});

/** Three draws that leave `a` drawn out and holding a play. */
const drawnOutHoldingAPlay = (): GameState => {
  let state = table({
    hands: { a: ["2C"], b: ["9D"], c: ["4H"] },
    top: "5S",
    // Drawn from the end: JC, 10H, then the 5D — which does match. The two at the
    // bottom stay put, so the seats after `a` still have a deck to reach for.
    drawPile: ["7C", "6D", "5D", "10H", "JC"],
  });
  state = draw(state, "a");
  state = draw(state, "a");
  state = draw(state, "a");
  expect(handOf(state, "a")).toEqual(["2C#1", "JC#1", "10H#1", "5D#1"]);
  return state;
};

/**
 * The second way to commit the offence (#260).
 *
 * The turn used to end itself after a third fruitless draw, which shut the
 * challenge window on the reach that had just opened it. It waits for the player
 * now — and **I'm done** pressed on a hand that has something playable in it is
 * a lie, permitted silently exactly as reaching for the deck is.
 */
describe("ending a turn you should have played on", () => {
  it("is permitted with no warning, and recorded", () => {
    let state = drawnOutHoldingAPlay();
    // The three draws were honest — they were stuck each time they reached — so
    // nothing is recorded against them yet.
    expect(state.challenge?.violation).toBeNull();

    state = must(state, { type: "endTurn", playerId: "a" });
    // No refusal, no hint, and the turn passes as asked.
    expect(currentPlayer(state).id).toBe("b");
    expect(state.challenge?.violation).not.toBeNull();
  });

  it("is judged against the hand as it stood when they pressed it", () => {
    let state = drawnOutHoldingAPlay();
    state = must(state, { type: "endTurn", playerId: "a" });

    // The 5D is what makes it an offence, and it only reached their hand on the
    // third draw — so a call has to be able to name it.
    expect(state.challenge?.reach.hand.map((c) => c.id)).toContain("5D#1");
    expect(state.challenge?.reach.activeSuit).toBe("S");
    expect(state.challenge?.reach.topRank).toBe("5");

    state = call(state, "b", "5D");
    expect(state.phase.kind).toBe("sunnyPlay");
  });

  it("resolves the way a reach does, and keeps the cards they drew legally", () => {
    const total = allCardIds(drawnOutHoldingAPlay()).length;
    let state = must(drawnOutHoldingAPlay(), { type: "endTurn", playerId: "a" });

    state = call(state, "b", "5D");
    // Step one: the play they skipped.
    state = play(state, "a", "5D");
    // Step two: a punishment card.
    state = surrender(state, "a", "2C");

    // Step three takes back what was drawn *illegally*, and nothing was: the three
    // draws were honest, so they keep them.
    expect(handOf(state, "a")).toEqual(["JC#1", "10H#1"]);
    expect(allCardIds(state)).toHaveLength(total);
    expect(new Set(allCardIds(state)).size).toBe(total);
  });

  it("is indistinguishable from an honest one, before and after", () => {
    // The same three draws, but nothing playable arrives.
    let honest = table({
      hands: { a: ["2C"], b: ["9D"], c: ["4H"] },
      top: "5S",
      drawPile: ["7C", "6D", "3D", "10H", "JC"],
    });
    honest = draw(honest, "a");
    honest = draw(honest, "a");
    honest = draw(honest, "a");
    honest = must(honest, { type: "endTurn", playerId: "a" });

    const dishonest = must(drawnOutHoldingAPlay(), { type: "endTurn", playerId: "a" });

    // A window is open on both, and everything a viewer is sent about them is the
    // same shape. Whether a call would land never leaves the server (#50).
    for (const state of [honest, dishonest]) {
      expect(state.challenge?.drawerId).toBe("a");
      expect(state.challenge?.resolved).toBe(false);
      expect(state.challenge?.reach.hand).toHaveLength(4);
    }
    expect(honest.challenge?.violation).toBeNull();
    expect(dishonest.challenge?.violation).not.toBeNull();
  });

  it("does not count against anybody's lockout, because it is not a reach", () => {
    const before = drawnOutHoldingAPlay();
    const after = must(before, { type: "endTurn", playerId: "a" });
    // A lockout is measured in reaches at the table. Ending a turn is not one.
    expect(after.totalReaches).toBe(before.totalReaches);
  });

  it("says which offence it was, so nothing downstream has to guess", () => {
    // The three facts the dialog was inferring from and getting wrong: nothing
    // taken back, a deck that is not empty, and — the part that cannot be
    // inferred — that this was a press rather than a reach (#363).
    const state = must(drawnOutHoldingAPlay(), { type: "endTurn", playerId: "a" });
    const result = applyIntent(state, { type: "callSunny", playerId: "b", cardId: card("5D").id });
    if (!result.ok) throw new Error(result.error);
    const called = result.events.find((event) => event.type === "sunnyCalled");

    expect(called).toMatchObject({ correct: true, returned: [], via: "endTurn" });
    expect(state.drawPile.length).toBeGreaterThan(0);
  });

  it("keeps the offence it was first caught for, if the same player presses on", () => {
    // 5H is playable on 5S throughout, so all three reaches are offences and the
    // violation is a reach. `endTurn` afterwards goes through `recordReach`
    // again, and must not rewrite what they were caught doing — the violation is
    // frozen with its snapshot.
    let state = table({
      hands: { a: ["5H", "2C"], b: ["9H"], c: ["4D"] },
      top: "5S",
      drawPile: ["QD", "KD", "3D"],
    });
    state = draw(state, "a");
    state = draw(state, "a");
    state = draw(state, "a");
    expect(state.challenge?.violation?.via).toBe("draw");

    state = must(state, { type: "endTurn", playerId: "a" });
    expect(state.challenge?.violation?.via).toBe("draw");
  });

  it("leaves a board the next player can read, with the punishment card buried", () => {
    // The path #364 was filed about, and the one case where nothing lands on the
    // punishment card: they drew nothing illegally, so `finishSunny` has nothing
    // to turn up. Pushed on top of the pile it was the card everybody could see
    // while `activeSuit` still answered to the card underneath it.
    let state = must(drawnOutHoldingAPlay(), { type: "endTurn", playerId: "a" });
    const total = allCardIds(state).length;

    state = call(state, "b", "5D");
    state = play(state, "a", "5D");
    state = surrender(state, "a", "2C");

    // The card in play is the play they were forced to make — one the table
    // watched land — and the suit agrees with it.
    expect(topCard(state).id).toBe("5D#1");
    expect(state.activeSuit).toBe("D");
    expect(state.namedSuit).toBeNull();

    // The 2C is in the pile and at the bottom of it, so it is neither showing nor
    // gone: it comes back the way any face-up card does, in a recycle.
    expect(pileFromTop(state)).toContain("2C#1");
    expect(pileFromTop(state).at(-1)).toBe("2C#1");

    // Which is the whole point: what `b` may play is what the board they can see
    // implies. A diamond or a 5, nothing else.
    expect(currentPlayer(state).id).toBe("b");
    const legal = legalCards(state, state.players.find((p) => p.id === "b")!);
    for (const playable of legal) {
      expect(isPlayable(playable, state.activeSuit, topCard(state).rank)).toBe(true);
    }

    expect(allCardIds(state)).toHaveLength(total);
    expect(new Set(allCardIds(state)).size).toBe(total);
  });

  it("does not let the offender choose what the table matches next", () => {
    // The same complaint from the other side, and the one `finishSunny`'s
    // empty-deck branch was already written against — the guard there is
    // `drawPile.length === 0`, so this path went straight past it. Whichever card
    // `a` gives up, the board `b` is handed is the same one.
    const resolve = (given: string): GameState => {
      let state = must(drawnOutHoldingAPlay(), { type: "endTurn", playerId: "a" });
      state = call(state, "b", "5D");
      state = play(state, "a", "5D");
      return surrender(state, "a", given);
    };

    for (const given of ["2C", "JC", "10H"]) {
      const state = resolve(given);
      expect(topCard(state).id).toBe("5D#1");
      expect(state.activeSuit).toBe("D");
    }
  });
});
