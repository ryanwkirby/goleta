import { describe, expect, it } from "vitest";

import { ANNOUNCE_MS, DEPARTURE_MS, PEEL_MS, RESHUFFLE_MS } from "../src/lib/beats.ts";
import { type LoggedEvent, stillNews } from "../src/lib/feed.ts";
import { CALL_NEWS_MS } from "../src/lib/judgedCall.ts";

const NOW = 1_700_000_000_000;

/** The event itself is nothing to do with it — what is being asked is when it
 * arrived. A reshuffle stands in for all of them. */
const logged = (at: number): LoggedEvent => ({
  id: 7,
  event: { type: "reshuffled", drawPileSize: 9 },
  at,
});

describe("stillNews", () => {
  it("acts out what has just landed", () => {
    expect(stillNews(logged(NOW), RESHUFFLE_MS, NOW)).toBe(true);
  });

  it("says nothing about a log with none of that in it", () => {
    expect(stillNews(undefined, RESHUFFLE_MS, NOW)).toBe(false);
  });

  it("refuses a moment that has already been and gone", () => {
    // #357: closing the rules screen mounts the table again, and the log
    // outlives it. Minutes-old, which is what was actually being replayed.
    expect(stillNews(logged(NOW - 240_000), CALL_NEWS_MS, NOW)).toBe(false);
  });

  it("still owes one that is part-way through", () => {
    // The case a mount-time bookmark would have swallowed: a call judged while
    // the rules screen was open is news the moment the table comes back.
    expect(stillNews(logged(NOW - 1_200), CALL_NEWS_MS, NOW)).toBe(true);
  });

  it("ends the moment the moment does", () => {
    expect(stillNews(logged(NOW - (CALL_NEWS_MS - 1)), CALL_NEWS_MS, NOW)).toBe(true);
    expect(stillNews(logged(NOW - CALL_NEWS_MS), CALL_NEWS_MS, NOW)).toBe(false);
  });

  it("is asked with each beat's own length, not one tuned figure", () => {
    const at = NOW - 4_000;
    expect(stillNews(logged(at), CALL_NEWS_MS, NOW)).toBe(true);
    expect(stillNews(logged(at), RESHUFFLE_MS, NOW)).toBe(true);
    // Shorter than the other two, so it is old news while they are not.
    expect(stillNews(logged(at), DEPARTURE_MS, NOW)).toBe(false);
  });

  it("gives a call its whole beat, both halves", () => {
    expect(CALL_NEWS_MS).toBe(PEEL_MS + ANNOUNCE_MS);
  });
});
