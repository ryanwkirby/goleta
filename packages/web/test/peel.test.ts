import { describe, expect, it } from "vitest";

import { PEEL_MS } from "../src/lib/beats.ts";
import { peelEndsAt, peelSchedule } from "../src/lib/peel.ts";

/**
 * The peel's internal schedule (#356). What was wrong was not the length of the
 * hold but the length of the movement: everything was over inside the first
 * fifth of `PEEL_MS` and the screen was a still photograph for two seconds.
 *
 * The property that must not break is the one #50 and #63 put here: **the
 * schedule is a function of how many cards landed since the reach and of nothing
 * else.** It cannot see the verdict, so a wrong call cannot peel differently
 * from a right one.
 */
describe("peelSchedule", () => {
  const COUNTS = [0, 1, 2, 3, 4, 8, 20];

  it("gives one card a beat you can follow, not a flicker", () => {
    // #63 shipped 420ms for the slide and 340 for the mark, overlapping by 200.
    const one = peelSchedule(1);
    expect(one.asideMs).toBeGreaterThan(420);
    expect(one.markMs).toBeGreaterThan(340);
  });

  it("winds the pile back one card at a time, oldest first", () => {
    // A stagger is what makes it a sequence rather than a fan arriving at once.
    expect(peelSchedule(2).staggerMs).toBeGreaterThan(0);
    expect(peelSchedule(3).staggerMs).toBeGreaterThan(0);
    // One card has nothing to be staggered against.
    expect(peelSchedule(1).staggerMs).toBe(0);
    expect(peelSchedule(0).staggerMs).toBe(0);
  });

  it("makes the named card a separate beat rather than an overlap", () => {
    // It may not start until the board is back to the reach.
    for (const count of COUNTS) {
      const schedule = peelSchedule(count);
      const asideEnd = count === 0 ? 0 : schedule.staggerMs * (count - 1) + schedule.asideMs;
      expect(schedule.markDelayMs, `${count} cards`).toBeGreaterThan(asideEnd);
    }
  });

  it("finishes moving with time left to look at the two cards", () => {
    // The settle is a floor, not the leftover: a peel whose last card arrived as
    // the announcement did would be the old bug the other way round.
    for (const count of COUNTS) {
      expect(PEEL_MS - peelEndsAt(peelSchedule(count)), `${count} cards`).toBeGreaterThanOrEqual(
        700,
      );
    }
  });

  it("tightens the stagger rather than running past the hold", () => {
    // A long queue is rare — the window shuts on the next player's first action —
    // but it is not bounded, so this has to be.
    let previous = Infinity;
    for (const count of [2, 3, 4, 8, 20]) {
      const stagger = peelSchedule(count).staggerMs;
      expect(stagger).toBeLessThanOrEqual(previous);
      expect(stagger).toBeGreaterThan(0);
      previous = stagger;
    }
  });

  it("says nothing about the verdict, because it cannot see one", () => {
    // The whole of what it is handed is a count. Same count, same beat, whether
    // the call landed or missed (#50).
    expect(peelSchedule(2)).toEqual(peelSchedule(2));
    expect(peelSchedule(1)).not.toEqual(peelSchedule(2));
  });

  it("is whole milliseconds, because they are going out as CSS", () => {
    for (const count of COUNTS) {
      const schedule = peelSchedule(count);
      expect(Number.isInteger(schedule.staggerMs), `${count} cards`).toBe(true);
      expect(Number.isInteger(schedule.markDelayMs), `${count} cards`).toBe(true);
    }
  });

  it("treats nonsense as no cards rather than moving backwards", () => {
    expect(peelSchedule(-3)).toEqual(peelSchedule(0));
    expect(peelSchedule(1.6)).toEqual(peelSchedule(1));
  });
});
