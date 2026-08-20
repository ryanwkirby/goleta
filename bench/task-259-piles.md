# Benchmark task — the draw pile under the wrong thumb (#259)

**The prompt below is verbatim and must not be edited.** Substitute the worktree
path on the first line and change nothing else.

Written as the **high-constraint arm** of round three, which measures the comment
diet (#264 / PR #265). Its pair, `task-243-roomcode.md`, is two components with
crisp acceptance criteria and almost nothing in `AGENTS.md` bearing on it. This
one is a single component shared between the phone table and the shared table
screen, where the constraints that must not break are spread over `Piles.tsx`,
`pileBox.ts`, `fitScale.ts`, `anchors.ts` and four bullets of `AGENTS.md`. If a
subtraction of comments helps or hurts, this is the arm it should show up in.

Chosen on merit from the backlog filed on 2026-08-20, before any arm was run.

**No line numbers appear in the prompt, and that is deliberate** — see the same
note in `task-243-roomcode.md`. The intervention removes comments from every file
this task touches, so a line reference true of one arm is false in the other.

The prompt names the shared screen as the thing that must not move but does
**not** say the component is shared, which is the first thing an arm has to
discover. That is the constraint-assembly this task is here to price.

---

```
Work ONLY in the repo at <WORKTREE PATH>

That is a full checkout of a card-game monorepo. Do not touch any other directory on this machine, and in particular never touch /Users/ryan/git/goleta.

# The task

Fix this bug.

## Upright, the draw pile is under the wrong thumb

The `Piles` component in `packages/web/src/components/Piles.tsx` draws the draw pile first and the card in play second, so on the upright phone table the deck is on the **left** and the card in play on the right.

The deck is the only one of the two you ever touch. On a phone held upright it is under the left thumb, which for most people is the hand holding the phone rather than the hand tapping it — so drawing a card is a reach across the screen, on the one control whose timing matters (a draw opens a challenge window against you) and which is deliberately unguarded.

The landscape peek strip already puts the draw pile at the right-hand end of its row, so fixing this makes the two phone layouts agree rather than making them differ.

## What to build

**Swap them in the upright phone layout: card in play on the left, draw pile on the right.**

## Constraints — an implementation that breaks one of these has not done the task

These are existing, deliberate rules of this codebase. `AGENTS.md` in the repo root has the surrounding reasoning.

- **The shared table screen must not swap.** That board is one design, scaled and sometimes turned a quarter, and it is read from four sides by people who never touch it — there is no "right hand" on a screen lying flat in the middle of a table. It must be unchanged at every scale and both ways up.
- **Nothing may get a scale, a size or a placement of its own** on that board. How much the piles paint is measured, the room between the bands reserved for seat names is measured against it, and the box the layout sees and the ink on the screen are one rectangle. A swap must not move any of that, and the test that holds it at every card size must still pass.
- **The flight animations follow the elements.** A draw must still fly from the deck and a play must still land on the card in play, in both phone layouts.
- **The draw pile stays tappable when you hold a legal play**, with no warning, no disabled state and no confirmation, exactly as it is today. Moving it is not an opportunity to guard it.
- **No change to the engine, the server or the protocol.** This is presentation.

## Done means

From the repo root of that worktree:
- `npm test` passes
- `npm run lint` passes
- `npm run typecheck` passes

# Rules

- Do NOT commit, push, or open a PR.
- Do NOT start a dev server or a browser.
- You may edit under `packages/*/src` and `packages/*/test`.

# Report

End your final message with a section headed exactly `## BENCH REPORT` containing:

1. `FILES READ:` every source file you opened or grepped the contents of, one per line, in the order you first read them. Be complete and honest — this is a measurement and an incomplete list invalidates it.
2. `FILES EDITED:` the files you changed.
3. `TEST RESULT:` final pass/fail of test, lint and typecheck.
4. `NOTES:` what made this harder than it needed to be. Specifically: how much of what you read turned out to be irrelevant, which single file cost you the most to understand, and what you had to hold in your head at once to make the change safely.
```
