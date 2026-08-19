import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The import graph is a one-way street, and this is what keeps it one.
 *
 * #224 removed three directory-level cycles from `packages/web/src`, all of
 * them caused by a pure value parked inside a module that renders or connects.
 * Two more were then introduced by later steps of the same refactor and went
 * unnoticed until a benchmark run happened to re-run the check by hand (#231) —
 * which is the whole argument for this file. A property nothing verifies is a
 * property you have until the next commit.
 *
 * It asserts the folder order rather than merely "no cycles", because the order
 * is the thing with a reason behind it: `lib` is a leaf holding pure logic and
 * the hooks over it, and everything else may reach down into it. A cycle is
 * what you get when something pure ends up in the wrong folder, so catching the
 * direction catches the cause rather than the symptom.
 *
 * **Type-only imports count.** They vanish at build time, so a cycle made of
 * them is not a runtime problem — but it is still a shared shape living inside
 * one of its own consumers, which is exactly the mistake `lib/tableProps.ts`
 * exists to fix. If this ever needs relaxing, relax it deliberately and say why
 * here.
 */

const ROOT = resolve(import.meta.dirname, "../../..");
const WEB = "packages/web/src";

/** Lowest first. A folder may import from itself and from anything below it. */
const LAYERS = ["lib", "net", "components", "motion", "screens"] as const;
type Layer = (typeof LAYERS)[number];

const layerOf = (file: string): Layer | null => {
  const rest = file.slice(`${WEB}/`.length);
  const top = rest.split("/")[0];
  return (LAYERS as readonly string[]).includes(top ?? "") ? (top as Layer) : null;
};

const sourceFiles = (): string[] =>
  execSync(
    `find ${WEB} -type f \\( -name '*.ts' -o -name '*.tsx' \\) -not -path '*/node_modules/*'`,
    { cwd: ROOT, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);

interface Edge {
  from: string;
  to: string;
  fromLayer: Layer;
  toLayer: Layer;
}

const edges = (): Edge[] => {
  const found: Edge[] = [];
  for (const file of sourceFiles()) {
    const fromLayer = layerOf(file);
    if (!fromLayer) continue;
    const src = readFileSync(resolve(ROOT, file), "utf8");
    for (const match of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
      const spec = match[1];
      if (!spec) continue;
      const to = relative(ROOT, resolve(dirname(resolve(ROOT, file)), spec));
      const toLayer = layerOf(to);
      if (!toLayer || toLayer === fromLayer) continue;
      found.push({ from: file, to, fromLayer, toLayer });
    }
  }
  return found;
};

describe("the shape of packages/web/src", () => {
  const all = edges();

  it("finds imports at all, so a silent regex failure cannot pass this file", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it("never imports upwards: lib → net → components → motion → screens", () => {
    const wrong = all
      .filter(({ fromLayer, toLayer }) => LAYERS.indexOf(toLayer) > LAYERS.indexOf(fromLayer))
      .map(({ from, to }) => `${from}  ->  ${to}`);

    // `lib` importing from `net` is what put `graduation.ts` in the wrong
    // folder; `screens/table` importing a shape out of `screens/HandView.tsx`
    // is what put the prop bundles in the wrong file. Both read as harmless.
    expect(wrong).toEqual([]);
  });

  it("has no cycle between any two folders", () => {
    const pairs = new Set(all.map(({ fromLayer, toLayer }) => `${fromLayer}>${toLayer}`));
    const cycles = [...pairs]
      .filter((pair) => {
        const [a, b] = pair.split(">");
        return pairs.has(`${b}>${a}`) && (a ?? "") < (b ?? "");
      })
      .map((pair) => pair.replace(">", " <-> "));

    expect(cycles).toEqual([]);
  });

  it("keeps lib a leaf, depending on nothing in web but itself", () => {
    const out = all.filter(({ fromLayer }) => fromLayer === "lib").map(({ from, to }) => `${from} -> ${to}`);
    expect(out).toEqual([]);
  });
});
