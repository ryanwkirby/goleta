import { describe, expect, it } from "vitest";

import { hashFor, routeFromHash } from "../src/net/route.ts";

describe("reading a room out of the URL", () => {
  it("takes a seat by default", () => {
    expect(routeFromHash("#/r/ABCD")).toEqual({ code: "ABCD", mode: "play" });
  });

  it("recognises the two watching entry points", () => {
    expect(routeFromHash("#/r/ABCD/watch")).toEqual({ code: "ABCD", mode: "watch" });
    expect(routeFromHash("#/r/ABCD/table")).toEqual({ code: "ABCD", mode: "table" });
  });

  it("upper-cases the code, so a typed link works either way", () => {
    expect(routeFromHash("#/r/abcd/table").code).toBe("ABCD");
  });

  it("has no room at all for anything it doesn't recognise", () => {
    // A code with rubbish after it isn't a room: salvaging one out of it would
    // land somebody on a table they didn't ask for, so the whole hash is
    // refused and they get the join form.
    for (const hash of ["", "#", "#/r/ABCD/", "#/r/ABCD/spectate", "#/r/ABC", "#/r/ABCDE"]) {
      expect(routeFromHash(hash)).toEqual({ code: null, mode: "play" });
    }
  });

  it("round-trips every mode", () => {
    for (const mode of ["play", "watch", "table"] as const) {
      expect(routeFromHash(hashFor("ABCD", mode))).toEqual({ code: "ABCD", mode });
    }
  });
});
