import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **The two rotate panels ask for opposite gestures, so they may not share an
 * animation** (#447). `RotatePanel` wants a phone turned onto its side;
 * `TableRotateNudge` wants one stood upright. They drew the same keyframe until
 * now, which meant the nudge showed a phone turning *into* landscape under a
 * heading asking for the opposite — and #446, flipping that keyframe's
 * direction, mirrored the nudge along with it rather than fixing it.
 *
 * Nothing in a build would fail if they were pointed back at one name: the class
 * exists, the phone rotates, and the picture is simply wrong. So this reads the
 * stylesheet and both components as text and fails instead — the trick
 * `largePrint.test.ts` and `pacing.test.ts` already use on facts that live in two
 * places and can silently drift.
 *
 * What it holds is the **ends**, which is where the instruction is: each
 * animation rests where its own panel is asking the phone to end up, in motion
 * and in the still frame `prefers-reduced-motion` leaves behind. The figures in
 * between are free to be tuned.
 */
const read = (path: string) => readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

const css = read("src/index.css");

/**
 * The two `@keyframes <name>` bodies in source order: the movement, and the
 * flattened still inside `prefers-reduced-motion`. Both have to be there — a
 * moving hint with no still frame is the half of this that costs the most.
 */
function keyframes(name: string): [moving: string, still: string] {
  const bodies: string[] = [];
  const at = new RegExp(`@keyframes\\s+${name}\\s*\\{`, "g");
  for (let m = at.exec(css); m; m = at.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const from = i;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    bodies.push(css.slice(from, i - 1));
  }

  const [moving, still] = bodies;
  if (moving === undefined || still === undefined) {
    throw new Error(`expected a moving and a still @keyframes ${name}, found ${bodies.length}`);
  }
  return [moving, still];
}

/** The angle a frame holds, e.g. `rotate(-90deg)` → -90. */
function angles(body: string): number[] {
  return [...body.matchAll(/rotate\((-?\d+)deg\)/g)].map((m) => Number(m[1]));
}

describe("the two rotate hints", () => {
  it("are two animations, each drawn by one panel", () => {
    // Comments come out first: both files argue about the other's animation by
    // name, which is the whole reason this is worth a test, and only what they
    // *draw* is being held here.
    const drawn = (path: string) => read(path).replaceAll(/\/\*[\s\S]*?\*\//g, "");

    const panel = drawn("src/components/RotatePanel.tsx");
    const nudge = drawn("src/components/TableRotateNudge.tsx");

    expect(panel).toContain("animate-rotate-hint");
    expect(panel).not.toContain("animate-stand-hint");

    expect(nudge).toContain("animate-stand-hint");
    expect(nudge).not.toContain("animate-rotate-hint");
  });

  it("are both declared as utilities", () => {
    expect(css).toContain("--animate-rotate-hint:");
    expect(css).toContain("--animate-stand-hint:");
  });

  // A moving frame and a still one apiece: the keyframes themselves, and the
  // flattened pair inside `prefers-reduced-motion`.
  it.each([
    ["rotate-hint", 0, -90],
    ["stand-hint", -90, 0],
  ])("%s starts at %i° and rests at %i°", (name, start, rest) => {
    const [moving, still] = keyframes(name);

    const turned = angles(moving);
    expect(turned.at(0)).toBe(start);
    expect(turned.at(-1)).toBe(start);
    expect(turned).toContain(rest);

    // The still frame is the only one anybody reading it sees, so it is the end
    // being asked for rather than the one being left.
    expect(angles(still)).toEqual([rest]);
  });
});
