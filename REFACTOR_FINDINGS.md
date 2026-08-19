# REFACTOR_FINDINGS.md

**What is expensive about working in this repo, and what is not.**

Round one's original Phase 0 survey — file sizes, the dependency graph,
duplication, the risk pass — is in the git history at `6b3f635` and its
conclusions are in the commits that acted on them (#223–#226, #229–#231, #234).
This file has been rewritten to carry what four measurements taught us instead,
because that is the part worth having in front of you before touching anything.

The evidence is in `bench/results.md`. The protocol is in `bench/README.md`.

---

## The headline

**File size is not this repo's cost driver. It was measured four times.**

| Tree | Tokens for one identical real change |
| --- | ---: |
| before any refactoring | 106,518 |
| `Table.tsx` 1,016 → 355 lines, split by state/render | 118,414 |
| scattered rationale consolidated, import cycles fixed | 109,592 |
| `Sunny.tsx` 677 → seven files, split by component | 106,196 |

Net across the programme: **−0.3% tokens, +11.8% tool calls, −3.5% wall time.**

Both shapes of split were tried. Cutting one cohesive file along a seam made
things **worse by 11%**, because a change needing both halves then read both
halves — 904 lines across two files buys nothing over 1,016 in one. Splitting a
file that held eight unrelated components recovered 3.1%. Neither moved the
total.

## What is expensive: assembling interlocking constraints

Every agent that has worked in these screens has said so, unprompted. The
clearest:

> *"The genuinely hard part was not finding the fields — the task named them —
> but deciding the **shape** of the display such that it survives the wild-8 case
> without lying. Everything else was mechanical."*

What that agent had to hold at once, for a change that added one row of UI:

- legality is `wild || suit === activeSuit || rank === topRank`, so the obvious
  label "match 5 or ♠" is **wrong**, not merely a hint
- `topRank` and `activeSuit` can belong to different physical cards after an 8,
  so they must never be drawn as one card
- five separate `AGENTS.md` prohibitions converge on that one panel
- the picker's height is subtracted from the player's own card size

None of that is navigation. **No arrangement of files reduces it**, which is
precisely what a flat line across four structural changes looks like.

## The pattern that proves it

Every arm named a costliest file. It was never the same one twice, and never one
the previous step had just fixed:

| After | Costliest file, per the agent |
| --- | --- |
| — (baseline) | `Table.tsx` — *"to place one boolean I had to scan the whole thing"* |
| `Table.tsx` split | `Sunny.tsx` and `PeekStrip.tsx` |
| rationale consolidated | `Sunny.tsx` — *"eight unrelated components"* |
| `Sunny.tsx` split | `HandView.tsx` — **and it changed nothing there** |

The complaint relocates every time; the total never moves. Removing one
constraint from a system with several only promotes the next.

That last row is the most instructive. `HandView.tsx` was named expensive for a
question it does not answer in code — *"is this column measured or fixed?"* —
whose answer is a `useBox` call but which cost an agent 240 lines of comment
prose to establish.

## The mis-step at the front of round one

Worth recording because it is the reusable lesson.

`Table.tsx` was chosen as the target because **48 of 233 commits had touched
it** — more than one in five, by a distance the highest-churn file in the repo.
Historical churn did not predict where the work actually was. Of the nine issues
open at the time, **none was squarely in it.**

Picking a target by looking backwards optimised the past.

## What round one did buy

Not what it aimed at, and worth keeping anyway:

- **490 tests, up from 391.** 67 of them over decision logic that had none at
  all, including the rule choosing which of five screens you are shown and the
  flag the entire Sunny Rule depends on.
- **The largest file in `packages/web` went 1,016 → 355 lines**, and no file in
  the table area is over 550.
- **Five import cycles gone** — three found by survey, two more that had been
  introduced by round one itself and wrongly reported as fixed — plus
  `packages/web/test/imports.test.ts`, which fails on exactly that mistake. A
  property the build checks instead of a claim in a commit message.
- Rationale stated once instead of four times (#229), and a written map of where
  a new control may go (#230).

## What is still true about the codebase

From the original survey, and unchanged:

- **`packages/engine` is the good part.** Pure, no `Date.now()`, no
  `Math.random()`, all randomness recorded in a replayable event stream, 118
  tests including seeded full-game simulations. `redact.ts` is a real, tested
  security boundary. Do not restructure it.
- **`packages/server` is a thin authoritative referee.** The seat id is stamped
  server-side, so a client cannot act as another player. No duplication worth
  naming.
- **`rules.ts` (790) and `rooms.ts` (833) are over 500 lines and are fine** —
  ~30 and ~40 small functions, largest 67 lines, comprehensively tested. They
  fail the line-count metric and pass every metric that matters. Splitting them
  would spread a well-organised subject across files and make the reader grep.
- **42% of source lines are comments, and they are load-bearing.** `AGENTS.md`
  exists because these decisions read as bugs to a fresh pair of eyes. Nothing
  in the measurement programme suggests the prose is the problem. The problem is
  that some facts live *only* in prose, and some prose lives far from what it
  governs.
- **No secrets, no `any`, no non-null assertions, no `@ts-ignore`, no TODOs.**
  Dependencies are all real, current and used.

## Open, from the original survey and never actioned

Deliberately left for a risk pass rather than folded into refactoring:

- Five dead exports, largest `isNoteworthy` in `lib/format.ts` at 81 lines.
- `socket.ts` casts `JSON.parse` to `ClientMessage` with no runtime validation.
  Most fields are hand-checked; `name`, `code` and `intent` are not type-checked,
  so a malformed type reaches a generic error and fills the log. Low severity,
  no crash, no cross-client effect.
- No rate limit on anything but `help`.
- `route()` in `rules.ts` has an exhaustive switch with no `default`, so an
  unknown intent returns `undefined` and is handled correctly two layers later
  by coincidence.
