import { describe, expect, it } from "vitest";

import type { Card } from "@goleta/engine";

import { NEXT_SORT, sortHand, type HandSort } from "../src/lib/sort.ts";

/** `hand("5H", "AS")` — the same shorthand the engine tests use. */
const hand = (...specs: string[]): Card[] =>
  specs.map((spec) => ({
    id: `${spec}#1`,
    rank: spec.slice(0, -1) as Card["rank"],
    suit: spec.slice(-1) as Card["suit"],
  }));

const ids = (cards: readonly Card[]): string[] => cards.map((card) => card.id.replace("#1", ""));

describe("sorting a hand", () => {
  it("leaves it in the order the cards reached you", () => {
    const dealt = hand("KD", "2C", "10H");
    expect(ids(sortHand(dealt, "dealt"))).toEqual(["KD", "2C", "10H"]);
  });

  it("runs low to high by rank, with the ace at the bottom", () => {
    const dealt = hand("KD", "10H", "2C", "AS", "JC");
    expect(ids(sortHand(dealt, "rank"))).toEqual(["AS", "2C", "10H", "JC", "KD"]);
  });

  it("groups by suit, low to high inside each one", () => {
    const dealt = hand("KD", "2C", "AD", "9C", "3H");
    expect(ids(sortHand(dealt, "suit"))).toEqual(["2C", "9C", "AD", "KD", "3H"]);
  });

  it("puts two of the same rank in the same order every time", () => {
    // Otherwise a pair of fives would swap places on an unrelated redraw, and
    // the card you were about to tap moves out from under your finger.
    const one = sortHand(hand("5S", "5H", "5C"), "rank");
    const other = sortHand(hand("5C", "5S", "5H"), "rank");
    expect(ids(one)).toEqual(ids(other));
  });

  it("never loses or invents a card", () => {
    const dealt = hand("8H", "8S", "AC", "10D", "QD");
    for (const sort of ["dealt", "rank", "suit"] as HandSort[]) {
      expect(ids(sortHand(dealt, sort)).toSorted()).toEqual(ids(dealt).toSorted());
    }
  });

  it("leaves the hand it was given alone", () => {
    const dealt = hand("KD", "2C", "10H");
    sortHand(dealt, "rank");
    expect(ids(dealt)).toEqual(["KD", "2C", "10H"]);
  });

  it("cycles back to where it started in three taps", () => {
    let sort: HandSort = "dealt";
    const seen: HandSort[] = [];
    for (let tap = 0; tap < 3; tap += 1) {
      sort = NEXT_SORT[sort];
      seen.push(sort);
    }
    expect(seen).toEqual(["rank", "suit", "dealt"]);
  });
});
