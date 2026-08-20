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


---

# Third measurement — the same task again, after the read-cost work

`c7452ab` adds nothing structural. It states the peek strip's wrap rule once
instead of four times (#229), writes down the placement map that was scattered
across four files (#230), puts the suit helpers back where people look for them
(#231), and fixes two import cycles #228 wrongly claimed were gone — plus a test
that fails on that exact mistake.

Same task, same prompt, third arm.

| Commit | What it is | Tokens | Tools | Seconds | Insertions |
| --- | --- | ---: | ---: | ---: | ---: |
| `e6a85b4` | before any of this | 106,518 | 34 | 376 | 138 |
| `b239075` | after the big refactor | 118,414 | 42 | 447 | 107 |
| `c7452ab` | after the read-cost work | **109,592** | **33** | **359** | 93 |

## Read against the state it followed, it worked

Against `b239075`: **−7.5% tokens, −21% tool calls, −20% wall time.** The
read-cost pass recovered most of the regression the refactor introduced, and it
did so while the produced patch got *smaller* again (93 insertions against 107),
so this is not a case of doing less work.

The agent's own account moved too. Both earlier arms put irrelevant reading at
*"roughly half"*; this one says **"roughly a third."**

## Read against the actual starting point, it is a wash

Against `e6a85b4`: **+2.9% tokens, −3% tool calls, −4.5% wall time.**

That is the number that answers the question. After a twelve-step refactor that
took the largest file from 1,016 lines to 355, added 99 tests, removed the import
cycles and consolidated the rationale — **a real change from this backlog costs
about what it cost before.** Tokens marginally up, tool calls and wall time
marginally down, all three inside what one sample per arm can resolve.

## The conclusion, after three experiments

**This work did not make changes cheaper, and further refactoring of the same
kind should not be expected to.**

What it did buy is real and worth keeping: 490 tests against 391, decision logic
that had no coverage now having 67 tests, a DAG the build enforces instead of a
claim in a commit message, and rationale that is stated once. None of that shows
up in a token count and none of it is nothing.

But the premise the protocol is built on — that shrinking the largest file makes
the next change measurably cheaper — did not hold here, across three
measurements and two different tasks. The most likely reason is in the Phase 0
notes and was visible before any of it started: **`Table.tsx` was chosen for
having the most historical churn, and historical churn turned out not to predict
where today's work lands.** Of nine open issues at the time, none was squarely in
it.

## What every arm agreed on

All three runs of this task named the same file, and it is not one that was
touched:

> *"Costliest single file: `Sunny.tsx` itself. It is 677 lines holding eight
> unrelated components — the call button, the peel, the announcement, the caught
> dialog, the explainer, the picker, the suit picker — and the doc comments are
> long enough that finding the ~50 lines that actually render the picker meant
> reading nearly all of it."* (third arm)

That is a different problem from the one #228 solved. `Table.tsx` was one large
*cohesive* thing — state and render for one screen — and splitting it along that
seam meant a change needing both halves read both halves. `Sunny.tsx` is eight
*unrelated* things in one file, where a change needs one of them and pays for
all eight.

If there is a next experiment, that is the hypothesis to test, and it should be
tested **cheaply and first**: split `Sunny.tsx` by component, change nothing
else, re-run this same task. One commit, one measurement. Three flat results is
enough evidence to stop assuming and start checking before spending.


---

# Fourth measurement, and the conclusion

`9cffd68` splits `Sunny.tsx` — 677 lines holding eight unrelated components —
into seven files, one per component. Not a line of component code changed. It
was chosen because all three previous arms named that file as the costliest
thing to understand, and because it is a **different shape** of split from
`Table.tsx`: no cohesive seam for a change to straddle, so a change to the
picker should stop paying to read seven neighbours.

| Commit | What changed | Tokens | Tools | Secs | Lines written |
| --- | --- | ---: | ---: | ---: | ---: |
| `e6a85b4` | before anything | 106,518 | 34 | 376 | 138 |
| `b239075` | `Table.tsx` split by state/render | 118,414 | 42 | 447 | 107 |
| `c7452ab` | rationale consolidated, cycles fixed | 109,592 | 33 | 359 | 93 |
| `9cffd68` | `Sunny.tsx` split by component | **106,196** | 38 | 363 | 99 |

**Net across the whole programme: −0.3% tokens, +11.8% tool calls, −3.5% wall
time.** Four structural changes, two of them substantial, and the cost of a real
change from this backlog is indistinguishable from where it started.

The hypothesis this arm tested was right in its own terms — splitting by
component did recover 3.1% where splitting by cohesion had cost 11% — but the
effect is small and the total is flat.

## The pattern across all four

Every arm named a costliest file. It was never the same file twice, and it was
never a file the previous step had just fixed:

| After | Costliest file, per the agent |
| --- | --- |
| — (baseline) | `Table.tsx` — *"to place one boolean I had to scan the whole thing"* |
| `Table.tsx` split | `Sunny.tsx` and `PeekStrip.tsx` |
| read-cost work | `Sunny.tsx` — *"eight unrelated components"* |
| `Sunny.tsx` split | `HandView.tsx` — **and not for anything it changed there** |

The complaint relocates every single time and the total never moves. Removing a
constraint from a system with several does not speed the system up; it promotes
the next one.

## Why the number will not move: the cost is not navigation

The last arm said it outright, and it is the most useful sentence in this file:

> *"The genuinely hard part was not finding the fields — the task named them —
> but deciding the **shape** of the display such that it survives the wild-8 case
> without lying. Everything else was mechanical."*

And on what it actually had to hold at once: that legality is `wild || suit ===
activeSuit || rank === topRank`, so the obvious phrasing "match 5 or ♠" is
*wrong* rather than merely a hint; that `topRank` and `activeSuit` can belong to
different physical cards after an 8, so they must not be drawn as one; that five
separate `AGENTS.md` prohibitions converge on this one panel; and that the
compact picker's height is subtracted from the player's own card size.

None of that is a navigation problem. **It is domain reasoning, and no
arrangement of files reduces it.** Each arm paid roughly the same to assemble the
same set of constraints, whichever files they happened to be spread across —
which is exactly what a flat line across four structural changes looks like.

Note also that even `HandView.tsx` was named as expensive *for a question it did
not answer in code*: "is the column measured or fixed?", whose answer lives in
comment prose. That is the same finding as #229 and #230, arriving for the third
time.

## What the programme actually bought

Nothing in tokens. Worth keeping anyway, and worth being honest that it is not
what was being aimed at:

- 490 tests against 391 — 67 of them over decision logic with no coverage at all,
  including the screen-routing rule and the flag the Sunny Rule depends on.
- The largest file in `packages/web` went 1,016 → 355 lines; no file in the
  table area is now over 550.
- Three import cycles removed, two more found and fixed that #228 had wrongly
  claimed were gone, and a test that fails on exactly that mistake — a property
  the build checks instead of a claim in a commit message.
- Rationale stated once instead of four times, and a written map of where a new
  control may go.

## Recommendation: stop refactoring for token cost

Four measurements, two tasks, one clear answer. The protocol's premise — that
shrinking the largest file makes the next change measurably cheaper — does not
hold in this repo, and the reason is now well evidenced rather than guessed:
**this codebase is expensive because its rules are subtle and interlocking, not
because its files are large.** The prose that makes it expensive is also what
makes it correct; `AGENTS.md` exists precisely because these decisions read as
bugs to a fresh pair of eyes.

If cost is to be attacked, attack the thing every arm actually complained about.
The candidates, in the order the evidence supports them:

1. **Put the constraints where the code is.** Five prohibitions converge on the
   accusation picker and all five live in `AGENTS.md`. #229 and #230 were the
   first two steps of this and were the only intervention that improved a
   measurement against the state it followed (−7.5%).
2. **Answer load-bearing questions in code rather than in comments.** "Is this
   column measured or fixed?" cost an agent 240 lines of prose to answer, and
   the answer is a `useBox` call.
3. **Do not split further for size.** It has been tried twice, in both shapes,
   and neither moved the total.

---

# Fifth measurement — round two, constraints at the code

`79c6619` is round two: the prohibitions that govern four files stated at those
files with the issue number as the authority (#235), two load-bearing questions
answered where they get asked rather than in a distant file's prose (#236), and
the round-one negative result written into `AGENTS.md` so it is not re-derived
(#237). No source logic changed; the suite is unchanged at 490.

Same task, same prompt, fifth arm.

| Commit | What it is | Tokens | Tools | Secs | Insertions |
| --- | --- | ---: | ---: | ---: | ---: |
| `e6a85b4` | before any of this | 106,518 | 34 | 376 | 138 |
| `b239075` | `Table.tsx` split by state/render | 118,414 | 42 | 447 | 107 |
| `c7452ab` | rationale consolidated, cycles fixed | 109,592 | 33 | 359 | 93 |
| `9cffd68` | `Sunny.tsx` split by component | 106,196 | 38 | 363 | 99 |
| `79c6619` | **constraints at the code** | **85,801** | **24** | **266** | **80** |

**Against the state it followed (`9cffd68`): −19.2% tokens, −36.8% tool calls,
−26.7% wall time.** Against the original starting point: −19.4%, −29.4%, −29.3%.

That is the largest move in the programme by a factor of two and a half, in the
direction round two predicted, and it is the first arm where every metric agrees
in direction — tokens, tool calls, wall time **and** insertions all fell
together. Four structural changes moved the total −0.3%; this moved it −19%.

## It is not a smaller number bought with less work

The obvious way to read a cheaper arm is that it did less. It did not. The
feature is the same feature in both layouts, all three checks pass, and the
patch is *smaller* — 80 insertions against 99 — because the design is better:
it shares a wrap row with the sentence already there instead of adding a row.

That choice is the intervention working, traceably. The agent's own account of
what it had to hold at once, item 2:

> *"The compact picker's height is measured, not fixed — `HandView` → `useBox` →
> `handHeight` — so any row I add is paid for in the player's card size, which is
> what pushed me to share a wrap row with the existing note instead of adding a
> line."*

That is the fact #236 put on the `compact` prop, almost verbatim, and it is the
same fact the previous arm named `HandView.tsx` as its costliest file for —
having read 240 lines of comment prose to get it. This arm read `HandView.tsx`
lines 150–200 and nothing else.

## What each half of the round actually bought

**#236, candidate 1 — the docking/height coupling. Paid.** Directly, as above.

**#236, candidate 2 — `PileSuit`'s `named` variant. Did not obviously pay.** The
trap was avoided, and for the documented reason:

> *"Its type is `PileSuit`, whose `named` variant is read out as 'spades
> **called**' — a claim that a person chose the suit."*

But the agent still read `lib/pile.ts` in full to get there, and described its
*"entire value here"* as negative — it exists to tell you the obvious reuse is
wrong. Moving that sentence onto the type did not save the read. Either the
placement is still wrong or the fact needs to be where `SuitMark` is reached
for, not where `PileSuit` is declared.

**#235 — the signposts. Bought the search, cost something at the file.** The
agent held all five prohibitions correctly without hunting through `AGENTS.md`.
It also named the picker as its costliest file, and said why:

> *"~140 lines of which roughly half is prose. The header block lists five
> prohibitions in a deliberately intimidating register ('holding four of them is
> not enough')... Both are load-bearing, and both are written to make you stop.
> Working out that showing the *board* trips none of the five — every one of
> them is about the offender's cards, not the position — took longer than
> writing the change, and I re-read the block twice."*

Worth taking seriously. A signpost that stops somebody is doing its job the
first time and taxing them every time after. The net is still sharply down, but
if headers accrete this is where the cost comes back.

## The pattern that has held four times just broke

Every previous arm named a costliest file that was **never** the one the
previous step had just fixed. This one named `SunnyAccusePicker.tsx` — the file
round two edited most.

| After | Costliest file, per the agent |
| --- | --- |
| — (baseline) | `Table.tsx` |
| `Table.tsx` split | `Sunny.tsx` and `PeekStrip.tsx` |
| read-cost work | `Sunny.tsx` |
| `Sunny.tsx` split | `HandView.tsx` |
| **constraints at the code** | **`SunnyAccusePicker.tsx` — the file just edited** |

Read one way that is the complaint finally landing where the work is instead of
relocating. Read another it is the intervention becoming the new bottleneck.
One sample cannot tell those apart.

## What cannot be concluded, and two of these are serious

**The model each arm ran on is not recorded anywhere in this directory.** Arm
five ran as a general-purpose subagent of an Opus 5 session. If arms one to four
ran on a different model or a different harness, that alone could account for
some or all of a 19% move, and nothing here would show it. This is the largest
threat to the result and it is unfalsifiable after the fact. **Record the model,
the harness and the date on every arm from now on** — added to `README.md`.

**The intervention was tuned to this benchmark's own complaints.** #236's first
candidate was chosen *because* arm four named it. So arm five substantially
tests whether answering the exact question the previous arm asked makes the next
run of *that same task* cheaper — which is close to circular. It is good
evidence the mechanism works and weak evidence it generalises. Rule 2 in
`README.md` guards against swapping the task after seeing a number; it does not
guard against tuning the intervention to a task already run four times, and it
should.

**One sample per arm still resolves very little.** 19% is roughly four times the
noise floor and all four metrics agree, which is more than any previous arm
managed — but it is one draw.

## What to do next, before believing this

1. **Record the model and harness for every arm**, retroactively where it can be
   recovered.
2. **Run a second, different task** from the open backlog against `9cffd68` and
   `79c6619`, chosen on merit and never run before. If constraints-at-the-code
   is a real effect it should show up on a task the intervention was not shaped
   around. If it does not, this arm is teaching to the test and should be
   recorded as such.

Until (2) exists, the honest statement is: **the one intervention that has ever
moved this number is putting facts where they are needed, it has now done so
twice (−7.5%, then −19.2%), and both times it was measured on the task that
prompted it.**

The produced patch is kept at `task-220-arm5-roundtwo.patch` in the run's
scratch directory and was otherwise discarded, per rule 7.

---

# Second task — the lockout's unit (#222), paired

Round two's confirmation run, and the point of it is rule 11: `task-220-picker
.md` had been run four times *before* round two was designed, and two of the
three parts of that intervention were chosen because arms of that task
complained about them. −19.2% on the task the work was shaped around is
evidence the mechanism works. It is not evidence it generalises.

So: a second task, chosen on merit from the open backlog, never run before, both
arms byte-identical, sequential, on the same pair of trees.

| Arm | Tree | Tokens | Tools | Secs | Insertions | Files edited |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| before | `9cffd68` | 109,330 | 56 | 326 | 104 | 20 |
| after | `79c6619` | 107,769 | 48 | 350 | 111 | 22 |
| | | **−1.4%** | −14.3% | **+7.4%** | +6.7% | |

**Flat.** −1.4% on tokens is a quarter of the noise floor, and the metrics
disagree in direction — tool calls down, wall time up. Nothing here reproduces
the −19.2%.

## Why this is a weak test, which is a finding about the backlog

#222 was chosen because it is the **only** open issue that lands in the four
files round two put headers on. It turned out to be centred somewhere else
anyway: both arms named `packages/engine/src/rules.ts` as the costliest file,
and the engine is explicitly out of scope for this work and was never touched by
it. An intervention with no surface in the area a task lives in cannot be
expected to move that task's cost.

That the backlog offered exactly one candidate, and that even it was centred
outside the intervention, is the real result here. **The pilot was narrow — four
files — so the set of tasks that can fairly test it is nearly empty.**

Two more reasons to hold this loosely. It is a **rename**, and both arms said a
single well-chosen grep returned the whole file set up front; both reported the
lowest irrelevant-reading figures ever recorded here (~20%, against "roughly a
third" and "roughly half" on #220). Assembling interlocking constraints is what
round two attacked, and a rename needs comparatively little of it. And it is
still one sample per arm.

## The after arm did produce a better patch

Not a cost finding, but the only quality difference between the arms and worth
recording. The task said a rename must be complete. The **before** arm left two
player-facing strings describing the lockout in the old unit:

- `SunnyExplainer.tsx:33` — *"you can't call again for three draws"*
- `SunnyAccusePicker.tsx:83` — *"Get it wrong and you can't call again for three
  draws."*

The after arm found and fixed both, which is why its patch is seven lines
larger. Both arms correctly left `drawsThisTurn` and `MAX_DRAWS_PER_TURN` alone
— those count cards and are a genuinely different concept nine lines away in the
same interface.

**Do not read this as the intervention working.** The discarded contaminated run
on the *before* tree also found both strings, via a grep for behaviour phrasing
rather than for the identifier. So this is within-arm variance in how thoroughly
an agent sweeps for stray copy, not a property of the tree.

## What both arms found that the task never mentioned

Both, independently: `GameState` is persisted through `JSON.stringify` in
`persist.ts`, so renaming `totalDraws` is a snapshot-shape change and needs
`SNAPSHOT_VERSION` bumped. Miss it and all three gates pass while every lockout
breaks on the next redeploy. Worth keeping for whenever #222 is actually done,
along with the fact that root `AGENTS.md` still cites `SUNNY_LOCKOUT_DRAWS` and
was outside both arms' edit scope.

## The criticism worth taking on the chin

From the after arm's notes, about the tree this work supposedly improved:

> *"The waste was in `CLAUDE.md`/`AGENTS.md`, which arrives pre-loaded and is
> enormous — roughly forty bullets of design reasoning about fan geometry, wake
> locks, shared-screen scaling and rotate prompts, none of which touches this
> change. The two bullets that mattered are buried in it."*

Round two **added** 49 lines to that document (#237). Every task pays for it,
including every task that has nothing to do with refactoring. Putting facts at
the code does not shrink the document; on this round it grew it. That cost is
real, it is paid on every arm, and it is invisible in a comparison where both
trees carry a large document and only one carries a slightly larger one.

## Where round two actually stands

| Task | Shaped around it? | Result |
| --- | --- | ---: |
| `task-220-picker.md` | **Yes** — two of three parts chosen from its own arms | −19.2% |
| `task-222-lockout.md` | No | −1.4% |

One large gain on the task the intervention was built from, and nothing on the
only other task available. The honest reading is that **the −19.2% is
substantially teaching to the test**, and that what generalises has not been
demonstrated.

`REFACTOR_PLAN.md` said what to do if round two came back negative, before the
number was known:

> *"If the answer is no again, that is a real answer and the honest response is
> to stop optimising for this and spend the effort on the feature backlog."*

This is not a clean "no" — it is one strong positive that does not replicate and
one flat result on a weak test. But it is not the confirmation the round needed,
and the cost of chasing it further is now well understood: **two rounds, seven
arms, two tasks, and the only reproducible finding is that the cost here is
domain reasoning rather than navigation.** Recommend stopping and spending the
effort on the feature backlog, exactly as the plan said.

What to keep regardless: the signposts and the in-code answers are correct on
their own terms, cost nothing to carry, and one arm demonstrably used one of
them. They just should not be expected to pay again.

## A discarded arm, and a harness bug that invalidated it

The first run of the before arm is thrown out. It is recorded because rule 8
says so and because the bug it found had been latent since the directory was
created.

`README.md`'s setup symlinks the worktree's `node_modules` at the live repo's.
Inside that directory `@goleta/engine → ../../packages/engine`, a **relative**
link, which resolves back through the symlink to
`/Users/ryan/git/goleta/packages/engine`. **Any arm that edits the engine or the
server has been compiling and testing against a different checkout.**

The arm hit it as a correct rename producing `expected 31000 to be +0` in an
unrelated pacing test — `NaN` from an undefined counter — and spent an unknowable
share of 126,122 tokens and 66 tool calls diagnosing my environment rather than
the task. That number measures the harness, not the tree.

**Arms one to five are unaffected**, checked rather than assumed:
`task-220-picker.md` confines edits to `packages/web/src`, whose tests import
`../src/…` relatively, and the engine was identical in every arm, so the wrong
resolution was type-only and invisible. The −19.2% stands.

Fixed by adding worktree-relative `packages/node_modules/@goleta/{engine,server,
web}` symlinks, which node resolves before the root `node_modules`. Verified
with a canary rather than by reasoning: renaming an exported symbol in the
worktree's engine now produces `packages/server/src/rooms.ts: Module
'"@goleta/engine"' has no exported member`, which is exactly the error that
failed to appear before. `README.md`'s setup block carries it now.

---

# Whole-programme comparison — `e6a85b4` vs `main`, two tasks

The end-to-end question both earlier series skipped: not one step of the work,
but all of it. Two freshly-filed M4 items, chosen on merit and never run before
— #259 (the upright draw pile's side) and #257 (quieting the call offer). Both
worded behaviourally, because the trees have different file layouts and a prompt
naming `components/sunny/*` or `lib/anchors.ts` would be a different task on
each arm.

| Task | Arm | Tree | Tokens | Tools | Secs | Ins |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| #259 | before | `e6a85b4` | 101,908 | 41 | 439 | 152 |
| #259 | after | `main` | **85,094** | 32 | 274 | 119 |
| | | | **−16.5%** | −22.0% | −37.6% | −21.7% |
| #257 | before | `e6a85b4` | 104,670 | 38 | 431 | 139 |
| #257 | after | `main` | **129,699** | 60 | 622 | 139 |
| | | | **+23.9%** | +57.9% | +44.3% | 0% |
| **both** | before | | 206,578 | 79 | 870 | 291 |
| **both** | after | | 214,793 | 92 | 896 | 258 |
| | | | **+4.0%** | +16.5% | +3.0% | −11.3% |

**The two tasks disagree sharply in direction, and the total is flat.** That is
the same answer round one got from four structural changes and round two got
from its control task. Five comparisons now, three tasks, and the only one that
ever moved was the one the intervention was designed from.

## The confound, stated once

Both before arms had `main`'s `AGENTS.md` auto-loaded rather than their own
tree's. A bench arm is a subagent of a session rooted at the live repo, so Claude
Code loads *that* `CLAUDE.md` — a symlink to `AGENTS.md` — whatever commit the
worktree is at. The document is 944 lines at `e6a85b4` and 1053 at `main`, and
the difference includes the placement map (#230) and the file-size entry (#237).

It cuts both ways: free access to the map should make a before arm cheaper,
while reconciling a document against a tree that contradicts it makes it dearer.
The #257 before arm reported the second and called it its biggest cost. So these
figures carry an asterisk and should not be quoted to the decimal — but they are
not meaningless, and an earlier draft of this file was wrong to call the run
void.

It is a hard limit rather than a bug: **this harness measures forwards, not
backwards.** Rule 10. Take the baseline before doing the work, which is what
rounds one and two did.

## #257 is the interesting half, because the map failed on its own ground

#257 is a *placement* problem — precisely what #230's "Where a new control goes"
map was built for. The after arm had the map. It cost **24% more** anyway, and
the arm explained why:

> *"The map — the one section explicitly built to stop this — was itself stale in
> two rows (it listed the sun as living at the strip's right end, issues after
> #189 moved it off). The map got me to the answer faster than reading the
> components would have, but I could not trust it without checking
> `PeekStrip.tsx` and `HandView.tsx` anyway, which is most of the saving gone."*

**That is verified, not just reported.** On `main` today the map lists the sun in
two contradictory places: `Peek strip, right end | prompt, sun, draw pile` and
`Under the strip, left | SunnyCallOffer`. #189 moved it off the strip and the
first row was never updated.

This is the sharpest finding in the whole programme, and it is about the
intervention rather than about the code: **a reference that has to be verified
before it can be used costs roughly what it saved.** #230 anticipated staleness
and said the linked issue is the authority and the map may be stale — which is
honest, and is also exactly what makes it unusable without checking. The map went
stale within a handful of issues of being written.

Filed as its own issue rather than fixed here, because a measurement should not
edit the thing it just measured.

## What survives regardless: the cheaper #259 patch is the wrong one

Verified by arithmetic against the card-width table, independent of both agents.
The judged-call peel draws the named card at `right-full mr-6` — a 68px `md` card
plus 24px, so **92px hanging off the pile card's left edge**. Safe only while the
deck is the left column, because the named card then lands on the deck, which
`aside` fades to 25% for exactly that reason. Swap the columns and those 92px
hang off the row: 216px (96 + 24 + 96) centred in the column puts the named card
at **−8px on a 393px phone and −24.5px on a 360px one**. One of the two
deliberately marked cards is clipped, during the one moment the whole table
watches.

The `e6a85b4` arm found it, did the arithmetic and mirrored the peel with the
animation properties sign-flipped — which is why its patch is 152 lines against
119. The `main` arm named `SunnyPeel.tsx` its costliest read, spotted the
directionality, then cleared it on *layering* grounds without checking width.

So on #259 the cheaper arm was also the wrong one. The protocol warns that an arm
spending more may have done more; the inverse holds too, and neither shows up in
a token count.

Both #259 arms also reported the coupling is undocumented in **both** trees —
`Piles.tsx` got a round-two header naming four rules and this is not one of them.
The thing that cost money is again the thing the intervention did not cover.

## Patches kept

`task-259-before.patch` has a working peel mirroring; `task-257-before.patch` and
`task-257-after.patch` both contain sound placement arguments (bottom-right above
the sort, and mid-right-edge respectively). Worth reusing whenever those issues
are done for real.

---

# Sixth measurement — the comment diet (#264 / PR #265), two tasks

**2026-08-20. Model: Opus 5 (`claude-opus-5`), inherited by every arm. Harness:
`general-purpose` subagents dispatched from a Claude Code session rooted at the
live repo, one at a time, never in parallel.** (Rule 9.)

The first intervention in this programme that *subtracts* rather than moves.
#264 cut the source from 43.8% comment characters to 28.3% — 391,137 down to
197,301, against a repo that shrank from 893,933 characters to 696,708. Every
earlier round rearranged where a fact lived; this one deleted facts.

| Tree | Comment chars | Share | `Piles.tsx` | `pileBox.ts` | `Lobby.tsx` |
| --- | ---: | ---: | ---: | ---: | ---: |
| before `4628866` | 391,137 | 43.8% | 183 ln, 55% | 96 ln, 80% | 796 ln, 32% |
| after `6a8c9d6` | 197,301 | 28.3% | 151 ln, 43% | 51 ln, 58% | 686 ln, 17% |

## Rule 10 does not bind this range, and that was checked rather than assumed

`git diff --quiet 4628866 6a8c9d6 -- AGENTS.md` is clean, and the diet touches no
`.md` file anywhere. Both arms are handed the document their own checkout has, so
the hazard that voided the whole-programme run — an old tree measured against a
newer `AGENTS.md` — is absent here. This is the one backwards measurement the
harness can take honestly, and only because the intervention is confined to code.

## The numbers

| Task | Arm | Tree | Tokens | Tools | Secs | Ins |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| #243 | before | `4628866` | 67,589 | 19 | 147 | 41 |
| #243 | after | `6a8c9d6` | **70,470** | 20 | 212 | 73 |
| | | | **+4.3%** | +5.3% | +44.2% | +78.0% |
| #259 | before | `4628866` | 109,694 | 40 | 471 | 154 |
| #259 | after | `6a8c9d6` | **70,065** | 22 | 189 | 28 |
| | | | **−36.1%** | −45.0% | −59.9% | −81.8% |

**Neither figure means what it looks like, and the reasons are different.**
Nothing in this round should be quoted without the two sections below.

## #243 is the honest wash, and the after arm bought something with its 4.3%

`task-243-roomcode.md` — make the room code itself copy the invite link, in the
lobby and the in-game panel. Two components, crisp acceptance criteria, almost
nothing in `AGENTS.md` bearing on it. Chosen as the low-constraint half of the
pair precisely so it would be boring.

It came out +4.3%, which is inside the noise floor the README warns about — but
the arms did not do the same work. The before arm inlined a `<button>` at both
sites (+41). The after arm factored out a shared `RoomCodeButton.tsx` and used it
twice (+73, of which 53 are the new file). That is the "spends more and writes
more may simply have done more" confound, stated in the protocol and visible
here.

Both arms named `Lobby.tsx` costliest, and both for the same reason — it holds
four unrelated things, so confirming the code is not drawn host-only means a jump
350 lines away. The after arm added, unprompted:

> *"`AGENTS.md`'s own note that splitting files did not pay off is consistent
> with this: the cost was one extra jump, not comprehension."*

That is corroboration of round one from an arm that had read round one's
conclusion, so it is worth exactly as much as that makes it. Recorded because it
is the same complaint round one's arms made about a different file.

**One methodological note worth keeping.** The before arm called `Lobby.tsx`
"500+ lines" when its tree has 796; the after arm called it "~800" when its tree
has 686. Both estimates are wrong, in opposite directions, in the arm's own
costliest-file finding. **Do not build anything on a line count an arm reports
about itself** — measure the tree.

## #259: the −36% is a correctness artefact, and this is the round's real result

`task-259-pile-side.md` is not new. The whole-programme round already ran it at
`e6a85b4` and at `4b79b37`, and recorded that a swap of the two piles silently
breaks the judged-call peel: the named evidence card is `absolute right-full
mr-6`, which places it to the **left** of the card in play. Deck-left, it lands
on the deck, which `aside` fades to 25% for exactly that reason. Deck-right, it
hangs off the row into the screen edge.

Re-verified here from the trees rather than from either agent: phone piles are
`lg` (96px) with `gap-6` (24px), so the row is 216px centred; the named card is
`md` (68px) plus 24px. On a 393px phone the named card's left edge lands at
**−3.5px**, on a 360px phone at **−20px**. One of the two deliberately marked
cards is clipped, during the one moment the whole table watches.

**Six arms have now run this task. They separate perfectly by whether they found
that coupling, and not at all by which tree they were on.**

| Arm | Tree | Tokens | Peel |
| --- | --- | ---: | --- |
| whole-programme before | `e6a85b4` | 101,908 | **mirrored ✓** |
| this round, before | `4628866` | 109,694 | **mirrored ✓** |
| whole-programme after | `4b79b37` | 85,094 | missed ✗ |
| off-series before | `4628866` | 74,650 | missed ✗ |
| this round, after | `6a8c9d6` | 70,065 | missed ✗ |
| off-series after | `6a8c9d6` | 69,579 | missed ✗ |

Two clean bands, no overlap: 101,908–109,694 for the arms that shipped a correct
patch, 69,579–85,094 for the arms that shipped a clipped evidence card. **The
`−36.1%` in the table above is the price of a bug, not a saving.**

It also puts a number on this harness's noise floor that nobody should ignore.
`4628866` and `4b79b37` differ **only in `bench/results.md`** — byte-identical
code, byte-identical prompt, same model. They came out **85,094 and 109,694, a
29% spread.** The README says treat anything under 5% as noise. On this task the
honest figure is nearer 30%, because the outcome itself varies.

## What the diet actually cost, verified in the diff

The successful arm said, unprompted, how it found the coupling:

> *"The only way to find it was to notice `Piles`' `aside` comment mentioning
> that the evidence 'overhangs the deck', then work out the phone-width
> arithmetic by hand. A naive swap passes all three checks and ships a clipped
> evidence card on every phone narrower than 400px."*

That comment is in the diet's diff. Before:

```ts
// Everything that isn't the evidence steps back while the peel is up. It also
// keeps the fan legible where it overhangs the deck or the called suit —
// nothing here moves or unmounts, so every anchor stays exactly where it was.
```

After:

```ts
// Everything that isn't the evidence steps back while the peel is up. Nothing
// here moves or unmounts, so every anchor stays where it was.
```

The surviving half is the half that restates the line under it. The deleted
clause is the only place in `packages/web/src` that said the peel's evidence
overhangs the deck — i.e. that the peel's geometry depends on which side the deck
is on. Post-diet, `git grep -i 'overhangs the deck'` returns nothing, and the
only remaining statement of the assumption is the raw `left-full` / `right-full`
classes in `SunnyPeel.tsx`, which say where the element goes and nothing about
what that depends on.

**Both arms that mirrored the peel had that clause. Both arms that ran without it
missed the coupling.** Two of the four arms that *had* it missed it too, so the
clause is plainly not sufficient — but it was the only thread, and the diet cut
it while keeping the sentence beside it that carries no information.

This is the first time in six rounds that a token measurement has produced a
concrete, falsifiable claim about a specific line of a specific commit. It is
worth more than the percentages.

## What can and cannot be concluded

**Can:** the diet did not make either task meaningfully cheaper. #243 is +4.3%
with the after arm doing more work; the only #259 comparison where both arms did
the same (wrong) work is the off-series pair at −6.8%. Six comparisons across
three tasks now, and the total has never moved outside noise except on the one
task round two's intervention was designed from. **Comment volume joins file
size and rationale placement on the list of things that do not drive this cost.**

**Cannot:** that the diet is harmful in general. One deleted clause on one task
is one data point, and the same clause failed to save two arms that had it.

**A real hazard in how this round was set up, stated plainly.** #259 was picked
*because* it was constraint-dense in files the diet cut hard — a best-case test
for detecting harm, not a random draw. That is the rule 11 hazard from the other
end: the task was chosen knowing the intervention. #243 was picked as the
control and behaved like one.

**A duplicate task file was created and deleted before any arm shipped.** I wrote
`task-259-piles.md` without checking `ls bench/`, because the README's task table
is stale and does not list the whole-programme round's two files. The two arms
run against that prompt are the "off-series" rows above — a valid paired
measurement (identical prompts, same conditions, both arms missing the peel) that
cannot be pooled with the canonical series because its prompt names files while
the canonical one is deliberately file-agnostic. Kept, labelled, not merged in.
**Read the directory, not the table.** The table is now fixed.

**A discarded arm.** The first attempt at #243-before died on a session limit
before its first edit. The worktree was verified clean and the arm re-run from
scratch; all four headline arms then ran the same day under the same model.

## Patches kept

`259c-before.patch` is the one worth having: it mirrors the peel — fan to
`right-full` with `flex-row-reverse`, `--peel-from` sign-flipped, named card to
`left-full ml-6`, and `peel-mark`'s entry offset defaulted so the shared screen
is untouched. It is the only correct #259 patch produced this round, and it
should be the starting point whenever #259 is done for real.
