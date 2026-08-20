# Benchmark task — the upright draw pile's side (#259)

**The prompt below is verbatim and must not be edited.** Substitute the worktree
path on the first line and change nothing else.

Written for the **whole-programme** comparison: `e6a85b4` (before any refactoring
or read-cost work) against `main` (after all of it). Both earlier series compared
adjacent steps; this asks the end-to-end question.

**Worded behaviourally, and that is load-bearing.** The two trees have different
file layouts — `components/sunny/*` and `screens/table/*` and `lib/anchors.ts`
exist only in the later one — so a prompt naming those paths would be a
different task on each arm. Only paths that exist in *both* trees are named.

Chosen on merit from the M4 backlog. It lands in `components/Piles.tsx`, which
round two put a header on, and in the upright table layout, which round one
split — so both rounds have surface here.

**Strip the measurement artefacts from the after tree** before running: `bench/`,
`REFACTOR_PLAN.md` and `REFACTOR_FINDINGS.md` do not exist at `e6a85b4`, and
`bench/results.md` contains previous agents' answers to the hard questions in
these very files. That is the lab notebook, not the refactor.

---

```
Work ONLY in the repo at <WORKTREE PATH>

That is a full checkout of a card-game monorepo. Do not touch any other directory on this machine, and in particular never touch /Users/ryan/git/goleta.

# The task

Fix this bug.

## Upright, the draw pile is under the wrong thumb

`packages/web/src/components/Piles.tsx` draws the draw pile first and the card in play second, so on the upright phone table the deck sits on the **left** and the card in play on the right.

The deck is the only one of the two you ever touch. On a phone held upright it falls under the left thumb — which for most people is the hand holding the phone, not the hand tapping it. So drawing a card is a reach across the screen, on the one control whose timing matters (a draw opens a challenge window against you that another player may act on) and which is deliberately left unguarded.

The landscape layout already puts the draw pile at the right-hand end of its row, so this makes the two phone layouts agree rather than making them differ.

## What to build

**Swap them in the upright phone table: card in play on the left, draw pile on the right.**

## Constraints — an implementation that breaks one of these has not done the task

These are existing, deliberate rules of this codebase. Read `AGENTS.md` in the repo root for the surrounding reasoning.

- **The shared table screen must not swap.** That is an optional extra device showing the middle of the table: one design, scaled to fit and sometimes turned a quarter, lying flat with people around it and read from four sides by people who never touch it. There is no "right hand" there. The pile component is shared between the phone table and that screen, so this has to be a variant rather than a change to the component's fixed order.
- **What the piles paint on the shared screen must not move.** There is a pure module measuring it and a test over that module; the allowance for the suit circle's overhang is symmetric on purpose. The test must still pass.
- **The flight animations must still start and end on the correct piles.** Motion looks its anchors up by reference, so confirm a drawn card still flies from the deck and a played card still lands on the card in play.
- **The draw pile stays tappable whenever it is your turn, including when you are holding a card you could legally play.** No disabled state, no confirmation, no warning, no hint. Drawing when you could have played is the offence the game's challenge rule exists to punish, and the interface must permit it silently.
- **Presentation only.** No change to `packages/engine` or `packages/server`, nothing new on the wire, no new protocol message.

## Done means

From the repo root of that worktree:
- `npm test` passes
- `npm run lint` passes
- `npm run typecheck` passes

# Rules

- Do NOT commit, push, or open a PR.
- Do NOT start a dev server or a browser.
- Only edit files under `packages/web/src`.

# Report

End your final message with a section headed exactly `## BENCH REPORT` containing:

1. `FILES READ:` every source file you opened or grepped the contents of, one per line, in the order you first read them. Be complete and honest — this is a measurement and an incomplete list invalidates it.
2. `FILES EDITED:` the files you changed.
3. `TEST RESULT:` final pass/fail of test, lint and typecheck.
4. `NOTES:` what made this harder than it needed to be. Specifically: how much of what you read turned out to be irrelevant, which single file cost you the most to understand, and what you had to hold in your head at once to make the change safely.
```
