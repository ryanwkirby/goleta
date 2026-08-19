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


---

# Second experiment — a real backlog item (#220), paired

The first experiment had a design flaw: one arm, a task chosen to suit the
refactor, and a confound where the second run did more work. This one fixes all
three. The task is a **real open issue** picked on merit, not built for the
benchmark; both arms run the **byte-identical prompt**; and they run in two
throwaway git worktrees — `e6a85b4` and `b239075` — **sequentially**, so neither
contends with the other for CPU or the vitest cache, and neither touches the
live deploy tree.

The task: *"the accusation picker never shows the board the call is judged
against"* — a verified gameplay bug that punishes the player who read the table
correctly.

| Arm | Tokens | Tool calls | Wall time | Files read | Insertions | Suite |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| **before** (`e6a85b4`) | 106,518 | 34 | 376s | 11 | 137 | 391 pass |
| **after** (`b239075`) | **118,414** | 42 | 447s | 18 | **106** | 486 pass |
| | **+11.2%** | +24% | +19% | +7 | −23% | |

**The refactored tree cost 11% more, and this time it cannot be explained away
by output.** The after-arm wrote a *smaller* patch — 106 insertions against 137
— so the extra spend was input: reading, not writing. Both arms produced a
correct, constraint-respecting fix confined to one file, and both passed all
three checks.

That is two experiments, two paired comparisons, both pointing the same way.

## What can and cannot be concluded

**Cannot:** that the refactor caused this. Each arm is n=1, seven of the
after-arm's extra reads were diligence rather than navigation — it grepped
`rules.ts`, `cards.ts`, `redact.ts`, `bot.ts` and `docs/RULES.md` to confirm one
fact about `isPlayable`, which the before-arm simply assumed — and the task lives
almost entirely in `Sunny.tsx`, which this refactor never touched. A change that
does not enter the restructured code cannot be a test of the restructuring.

**Can, and it is uncomfortable:** exactly one extra read is directly
attributable, and it is a regression this refactor introduced.

### The one attributable cost: card knowledge now lives in two files

Both agents needed the same thing — *what does this app use to draw a suit?* —
and both found `SUIT_GLYPH`, `SUIT_LABEL` and `isRed`.

- **Before**: one file. They sat in `components/Card.tsx`, next to the card
  component, which is where somebody looking for card presentation looks first.
- **After**: two. #224 moved them to `lib/cardShape.ts` to break the
  `components ↔ lib` cycle, and the after-arm read **both** `lib/cardShape.ts`
  and `components/Card.tsx`.

The cycle fix was correct on its own terms and the graph really is a DAG now.
But it was scored purely as hygiene, and this is the bill: a pure value moved
away from the thing it describes is harder to find, and *every* future change
that draws a suit pays that, not just the ones in the refactored area.

A re-export from `Card.tsx` would restore the discoverability without
reintroducing the cycle — `components` may import from `lib`. It was
deliberately not done, on the reasoning that two import paths for one thing is
its own smell. On this evidence that was the wrong call, and it is cheap to
reverse.

## The finding that does favour the refactor

In experiment 1's baseline, the agent named `Table.tsx` as *"the most expensive
file... to place one boolean I had to scan the whole thing"*.

**No run since has complained about `Table.tsx` at all.** Not the post-refactor
run in experiment 1, and neither arm here.

What both arms of this experiment complain about instead:

> *"`PeekStrip.tsx` cost the most for the least return — ~280 lines that are
> about four-fifths prose rationale for controls that have nothing to do with
> the picker."* (after)
>
> *"Costliest single file: `Sunny.tsx` itself. ~680 lines of which the majority
> is design rationale, and the rationale is load-bearing."* (before)

So the refactor did remove `Table.tsx` as a bottleneck. The total did not fall
because it was not the only one: `Sunny.tsx` (677 lines) and `PeekStrip.tsx`
(351, four-fifths prose) took over as the binding constraint, and neither was
touched. Removing one constraint from a system with several does not speed the
system up — it just promotes the next one.

That is the honest lesson of both experiments, and it is a lesson about the
Phase 0 target-picking rather than about the execution: **the file with the most
historical churn was not the file that makes today's work expensive.**

## What both arms said is actually expensive

Neither arm blamed finding code. Both blamed assembling *constraints*:

> *"The full set of 'must not hint' rules... are stated in `AGENTS.md` across
> about six separate bullets and are easy to satisfy accidentally-wrongly: the
> temptation is to write 'they had to match ♠, a 5, **or any 8**', which is
> true, harmless-looking, and points straight at cards in the hand the panel is
> meant to be silent about."* (after)
>
> *"The one genuine trap: `SuitMark` looks exactly like the helper the task is
> pointing at, and using it would have been a silent lie in the sr-only text
> ('spades called' for a suit that was never called). That only becomes visible
> after reading `pile.ts`'s doc comment in full."* (before)

Both arms found the trap and neither fell in — but both paid to find it. That is
what #229 and #230 are about, and on this evidence they are worth more than
another round of file-splitting.
