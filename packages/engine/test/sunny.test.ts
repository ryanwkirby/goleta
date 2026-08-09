import { describe, expect, it } from "vitest";

import {
  SUNNY_LOCKOUT_DRAWS,
  applyIntent,
  currentPlayer,
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
 * A reach that was an offence, then a recycle, then a reach that wasn't.
 *
 * A recycle mid-turn is the one thing that moves the board while a window is
 * open, so it is the one thing that can pull the reach an accusation is judged
 * against away from the reach that was actually the offence. (#74)
 *
 * a holds the 5H against a 3H, so their first reach is an offence. The deck
 * empties, the recycle turns up a spade, and their next reach — with nothing
 * playable against that — is honest.
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
    // The rewind puts the drawn card back, so the hand is as it was and the
    // play they were dodging is the first thing they owe.
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1"]);
    expect(state.phase.kind).toBe("sunnyPlay");
    expect(reject(state, { type: "drawCard", playerId: "a" })).toMatch(/Can't draw/);

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

  it("names the cards the rewind takes back, so the table can watch it happen", () => {
    const result = applyIntent(caughtInTheAct(), {
      type: "callSunny",
      playerId: "b",
      cardId: card("5H").id,
    });
    if (!result.ok) throw new Error(result.error);
    const called = result.events.find((event) => event.type === "sunnyCalled");
    expect(called).toMatchObject({ callerId: "b", targetId: "a", correct: true });
    // Read off the hand before the rewind moved it back onto the deck.
    expect(called?.type === "sunnyCalled" && called.returned.map((c) => c.id)).toEqual(["KD#1"]);
  });

  it("costs two cards from hand — and naming the card adds nothing to that", () => {
    let state = caughtInTheAct();
    state = call(state, "b", "5H");
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");
    // They started the turn on two cards and finish it on none: the skipped
    // play and the punishment, same as ever. Nothing is added for the caller
    // having had to name the card correctly.
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

    // The 7S they drew honestly is what they're now accused of skipping.
    state = call(state, "b", "7S");
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

    // 5H is the card they were dodging throughout — still nameable, even
    // though their hand has since picked up two more cards that aren't legal.
    state = call(state, "b", "5H");
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
    // A wild is always legal, wherever it was reached from — accusing it is
    // always a correct call.
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
    // a is caught on the first draw (KD) and reaches again before anyone calls
    // it. Neither drawn card is ever an option: the window is judged against
    // the reach that was the offence, and both of these arrived after it. Only
    // the hand a actually had a choice from is on the list.
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
    // Both 5H and 4S are legal against 5S; naming either lands the call, and
    // the offender still picks which one to actually play.
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
    // Nothing is rewound, so there is nothing to fly back to the deck.
    expect(called?.type === "sunnyCalled" && called.returned).toEqual([]);

    state = call(state, "b", "2C");

    expect(state.challenge?.resolved).toBe(true);
    expect(handOf(state, "b")).toEqual(["9C#1", "10C#1"]);
    expect(topCard(state).id).toBe("5S#1");
    expect(state.activeSuit).toBe("S");
    // a's turn carries on untouched.
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
      // A miss rewinds nothing, so it takes nothing back.
      returned: [],
      // It still shows its working: the same evidence a landed call shows, so
      // the table reads the verdict off the two cards rather than the wording.
      evidence: { inPlay: card("5S"), activeSuit: "S", since: [] },
    });
  });

  it("locks the caller out until three more draws happen at the table", () => {
    let state = draw(
      table({ hands: { a: ["2C"], b: ["9C"], c: ["4D"] }, top: "5S", drawPile: ["QD", "KD", "3D"] }),
      "a",
    );
    state = call(state, "b", "2C");
    expect(state.sunnyLockouts.b).toBe(state.totalDraws + SUNNY_LOCKOUT_DRAWS);

    // A fresh draw reopens the window, but b is still shut out of it — the
    // lockout counts draws at the table, not whether the window is open.
    state = draw(state, "a");
    expect(reject(state, { type: "callSunny", playerId: "b", cardId: card("2C").id })).toMatch(
      /Locked out/,
    );
    // Someone else at the table is untouched by b's lockout.
    const result = applyIntent(state, { type: "callSunny", playerId: "c", cardId: card("2C").id });
    expect(result.ok).toBe(true);
  });

  it("lifts once totalDraws has advanced by three, not before", () => {
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
      totalDraws: 10,
      sunnyLockouts: { b: 13 },
    };

    expect(reject(locked, { type: "callSunny", playerId: "b", cardId: card("2C").id })).toMatch(
      /Locked out/,
    );
    const stillLocked = { ...locked, totalDraws: 12 };
    expect(
      reject(stillLocked, { type: "callSunny", playerId: "b", cardId: card("2C").id }),
    ).toMatch(/Locked out/);
    const free = { ...locked, totalDraws: 13 };
    expect(applyIntent(free, { type: "callSunny", playerId: "b", cardId: card("2C").id }).ok).toBe(
      true,
    );
  });

  it("survives the rewind a later correct call performs", () => {
    // The rewind restores a whole cloned `GameState`, and lockouts live on it.
    // Restoring them wholesale would refund a wrong call made *before* the
    // snapshot was taken — b would walk away from a miss because somebody else
    // later got it right. `handleCallSunny` carries the two counters across the
    // `Object.assign` by hand; this is what would break if that were dropped.
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
    expect(state.sunnyLockouts.b).toBe(SUNNY_LOCKOUT_DRAWS + 1);

    // a reaches again, reopening the window, and c names the 5H — which really
    // was playable. That call lands and rewinds the game past b's miss.
    state = draw(state, "a");
    state = call(state, "c", "5H");
    expect(state.phase.kind).toBe("sunnyPlay");

    // b's miss stands, and the draws served against it weren't handed back.
    expect(state.totalDraws).toBe(2);
    expect(state.sunnyLockouts.b).toBe(SUNNY_LOCKOUT_DRAWS + 1);
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

    state = call(state, "b", "5H");
    expect(handOf(state, "a")).toEqual(["5H#1", "2C#1"]);
    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");

    // Both touched cards end up face up, and nothing has gone missing or been
    // duplicated along the way.
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

    // So the call lands, rather than every possible accusation being wrong
    // while the violation stood.
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
    // Same shape, but a had nothing playable against the 3H to begin with, so
    // there was never an offence and naming their one card is simply wrong.
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
    expect(state.sunnyLockouts["b"]).toBeGreaterThan(state.totalDraws);
  });
});

describe("the challenge window", () => {
  it("never tells the caller whether a submitted accusation would land", () => {
    // Both games look identical from the outside: someone drew a card, and a
    // call naming the one card both hands have in common is available either
    // way. Only the outcome differs — 2C is dead against the 5S in both, so
    // this particular accusation is wrong in both, but the *acceptance* of the
    // intent itself never depends on the hidden verdict.
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
    // 5H plays on the 5S, so a is not allowed to touch the deck — and the deck
    // being empty is no excuse. The recycle happens; so does the offence.
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
    // The rewind undoes the recycle too, so the 5S is showing again and the
    // play they were dodging is the one they now owe.
    expect(topCard(state).id).toBe("5S#1");
    expect(state.phase.kind).toBe("sunnyPlay");

    state = play(state, "a", "5H");
    state = surrender(state, "a", "2C");

    // Nothing they touched to turn up, so the deck is answered the way an empty
    // deck always is: the pile is shuffled back and a fresh card comes off it.
    // Crucially the punishment card is *not* left showing — that would let the
    // offender choose what the whole table matches next, which is the opposite
    // of what reaching is supposed to cost them.
    expect(topCard(state).id).not.toBe("2C#1");
    // Whatever came up, it is genuinely the card in play: suit and card agree.
    expect(state.activeSuit).toBe(topCard(state).suit);
    expect(state.drawPile.length).toBeGreaterThan(0);

    expect(currentPlayer(state).id).toBe("b");
    // The recycle assigns the draw pile outright, so this is the check that it
    // never does so over cards that were still in it.
    expect(allCardIds(state)).toHaveLength(total);
    expect(new Set(allCardIds(state)).size).toBe(total);
  });

  it("turns up a card nobody chose, rather than one the offender picked", () => {
    // The offensive shape of this: `a` is holding a card that would strand the
    // table and would love to place it. Reaching at an empty deck and inviting
    // the call must not be a way to do that.
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
    // Same shape of window as the guilty case above: someone reached, and a
    // call is available. Only the verdict differs.
    expect(state.challenge?.drawerId).toBe("a");
    expect(state.challenge?.violation).toBeNull();

    state = call(state, "b", "2C");
    expect(handOf(state, "b")).toEqual(["9C#1", "10C#1"]);
    expect(currentPlayer(state).id).toBe("a");
    expect(state.sunnyLockouts.b).toBeGreaterThan(0);
  });

  it("counts as a reach only when something actually came of it", () => {
    // Every card is in a hand, so there is nothing to draw and nothing to
    // recycle either. No card moves and no window opens, so there is no beat
    // here for anyone's lockout to count down against. (#74)
    let state = table({
      hands: { a: ["5H"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: [],
    });
    state = draw(state, "a");
    expect(state.challenge).toBeNull();
    expect(state.totalDraws).toBe(0);

    // A reach that recycles the pile is a reach, even though nothing reached a
    // hand: the window opens on it, so the count has to move with it.
    let recycling = table({
      hands: { a: ["5H", "2C"], b: ["9C"], c: ["4D"] },
      top: "5S",
      drawPile: [],
      buriedDiscards: ["KH", "QH", "JH"],
    });
    recycling = draw(recycling, "a");
    expect(recycling.challenge).not.toBeNull();
    expect(recycling.totalDraws).toBe(1);
  });
});

/**
 * What a judged call hands the table so it can read the ruling for itself: the
 * card that was in play when the offender reached, and whatever has landed on
 * top of it since. Set the named card beside it and the verdict is legible
 * without anybody being told it. (#63)
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
    // 2C and 4H are both dead against the 5S, so the draw was honest and the
    // call is wrong — and the table still gets the pair, because the difference
    // it is meant to see is that the two cards don't match.
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
    // a reaches while holding the playable 5H, then plays it anyway. The card
    // the accusation names is now in the pile rather than in their hand, and
    // the evidence has to say where.
    let state = caughtInTheAct();
    state = play(state, "a", "5H");
    expect(topCard(state).id).toBe("5H#1");

    const evidence = evidenceOf(state, "b", "5H");
    expect(evidence.inPlay).toEqual(card("5S"));
    expect(evidence.since.map((c) => c.id)).toEqual(["5H#1"]);
  });

  it("describes the board as it was, not as a wild 8 has since left it", () => {
    // The offence, then an 8 played on top of it that renames the suit. The
    // evidence is the position the accusation is judged against, so it is the
    // spade that was in play — a diamond here would rule the pair unreadable.
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
    // Only the card in play, never the pile it is sitting on: the peel is a
    // slice off the top, not the archaeology of the whole game.
    expect(wire).not.toMatch(/KC#1|QC#1/);
    // And nothing from the deck, which is the one thing the table never learns
    // early. `KD#1` is the card the offender drew and `QD#1` the next one down.
    expect(wire).not.toMatch(/KD#1|QD#1/);
  });

  it("is built fresh for each call rather than kept on the state", () => {
    // The challenge carries what it needs to build one — the pile at the reach,
    // frozen with the reach itself — and nothing shaped like an answer.
    const state = caughtInTheAct();
    expect(state.challenge?.reachPile).toEqual({ inPlay: card("5S"), ids: ["5S#1"] });
    expect(JSON.stringify(state.challenge)).not.toContain("evidence");
  });
});
