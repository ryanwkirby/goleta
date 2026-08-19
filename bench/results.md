# bench/results.md

Measurements of `bench/representative-change.md` ("you're next"), executed by a
**fresh agent with no prior context** each time, then discarded
(`git checkout .`). Fresh agents matter: an agent that has already explored the
module reads less on a second pass for reasons that have nothing to do with the
code, which would contaminate the measurement.

Sizes are for `packages/web/src/screens/Table.tsx`, the target module.

| Step | Table.tsx total | Table.tsx code | Tokens | Tool calls | Wall time | Suite |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| **baseline** (`e6a85b4`) | 1016 | 558 | **97,916** | 32 | 236s | 391 pass |
| **after #223–#226** (`568d6b0`) | 355 | 187 | **101,704** | 40 | 229s | 486 pass |
| | −65% | −66% | **+3.9%** | +25% | −3% | +95 |

## Baseline notes — 2026-08-19, commit `e6a85b4`

The change was completed correctly and all three checks passed (test, lint,
typecheck), so this is a clean measurement of a *successful* run rather than of
an agent floundering.

Files the agent had to read: `TurnGlow.tsx`, `Table.tsx`, `HandView.tsx`,
`PeekStrip.tsx`, `lib/facing.ts`, `engine/src/redact.ts`, `engine/src/types.ts`
(grep), plus `package.json` and `.oxlintrc.json`. It reported nothing read as
wasted except the auto-loaded `CLAUDE.md`.

Three observations from the run, unprompted, which are direct evidence for the
plan:

1. **`Table.tsx` was the most expensive file by a distance.** In its own words:
   *"To place one boolean I had to scan the whole thing to find where derived
   flags live (near the top) and where the layouts render (bottom, plus a
   separate `compact` early return that duplicates the `HandView` prop list)."*
   This is exactly what Step 3 and Step 5 are for.

2. **The prop-drilling cost is real and it was measured.** *"A one-flag change
   touching both layouts means edits in four spots across three files because
   the landscape path is `Table → HandView → PeekStrip`."* Four edit sites for
   one boolean. Evidence for Step 4.

3. **It found a duplication I missed in Phase 0.** The "walk to the next player"
   logic it needed *"already exists in a near-identical form in `lib/facing.ts`
   (`seatToFace`), but it walks `room.seats` and includes the starting seat and
   a bot filter, so it wasn't reusable — I duplicated the shape rather than
   generalising it."* Added to `REFACTOR_FINDINGS.md` §2.

Note on comparability: the agent declined to add a test file because the bench
spec pins the suite at 391 tests. Later runs face the same constraint, so the
comparison holds.


---

## After-refactor notes — commit `568d6b0`

**The token metric did not improve. It got slightly worse: +3.9%, with 25% more
tool calls.** That is the headline and it should not be buried, because the
protocol is explicit that flat input tokens after several steps mean the
refactoring was cosmetic.

I do not think that is the right conclusion here, but the number is the number,
and the reason it did not move is worth more than the number itself.

### Why it did not move

**The benchmark change spans exactly the seam the refactor cut along.**
"You're next" needs a new derived fact *and* a new thing drawn in two layouts.
Before, that meant reading `Table.tsx` (1,016 lines). After, it means reading
`Table.tsx` (355) **and** `useTableState.ts` (549) — 904 lines, which is not
meaningfully less than 1,016.

Splitting derivation from rendering cannot pay off for a change that needs both.
It pays off for a change that needs one: a wording change in the game-over panel
now reads a 67-line file instead of a 1,016-line one, and a new rule about which
screen you are shown now reads a 130-line pure module with 26 tests. Neither of
those is what this benchmark measures.

That is a flaw in the benchmark I chose, and choosing it was a mistake made
before the baseline was taken rather than after the result came in. It should be
recorded as such rather than corrected retroactively — picking a friendlier task
now, having seen this one fail, would not be a measurement.

### The agent also did more work

The baseline put the seat-walk inline in `Table.tsx` and added one component.
This run added a **pure `lib/upNext.ts` module** and a component, following the
convention the refactor made visible — and said so:

> *"The split of `Table.tsx` into `useTableState` + layouts made this cheap:
> `glowing` is a worked example of exactly this kind of flag, and following it
> meant one derivation site and two render sites. I read very little that turned
> out to be irrelevant."*

A better-factored change costs more output tokens than a worse one. That is a
real confound and it cuts against reading this as a clean regression, but it is
not enough to call the result a win either.

### What it found that the refactor did not fix

Both worth acting on, neither addressed by #223–#226:

1. **`PeekStrip.tsx` is now the most expensive file to understand in this area.**
   *"The prose header and inline comments run to roughly a third of the file, and
   the load-bearing fact for this change — the left cluster is the only part of
   the row allowed to wrap, so it is where new print goes — is stated three
   separate times in three different places rather than once at the point of
   use."* Duplicated **rationale**, which the Phase 0 scan did not look for
   because it only measured duplicated code.

2. **Placement is the expensive decision, not logic.** *"The landscape view has
   three plausible homes for a quiet line, and the constraints ruling out two of
   them are spread across `HandView.tsx`, `PeekStrip.tsx` and `AGENTS.md`. A
   one-line index of 'where a new quiet control may go, per layout' would have
   saved most of the exploration."*

3. Minor, and my fault: the bench spec confines edits to `packages/web/src`,
   while tests live in `packages/web/test` — so the agent could not give its new
   pure module the test every other `lib/` decision module has. The spec also
   still says "391 tests", which is stale.

### What did improve, independently of this benchmark

- `Table.tsx` 1,016 → 355 lines; no file in that area over 550.
- 67 tests over decision logic that had none, including the screen-routing rule
  and the assist flag the Sunny Rule depends on.
- Three import cycles → zero.
- No new dependencies; suite still 1.6s.

Those are worth having whether or not a token count moved. But they are not what
this file was created to measure, and it should not pretend otherwise.
