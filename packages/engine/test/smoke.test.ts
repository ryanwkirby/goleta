import { describe, expect, it } from "vitest";

import { ENGINE_VERSION } from "../src/index.ts";

describe("engine", () => {
  it("is importable from the workspace package", () => {
    expect(ENGINE_VERSION).toBeGreaterThan(0);
  });
});
