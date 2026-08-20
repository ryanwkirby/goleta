# bench/ — measuring what a change costs

The question this directory exists to answer: **does a given refactor make the
next real change cheaper?**

Round one answered it for four interventions, and the answer was no. The whole
record is in `results.md`; read it before proposing another. The short version
is that splitting files for size was measured twice, in both shapes, and moved
the total by −0.3%, while consolidating scattered rationale moved it −7.5%
against the state it followed.

Round two moved it **−19.2%** by putting constraints at the code they constrain
and answering load-bearing questions where they get asked — and then **−1.4% on
a second task the intervention was not shaped around.** One strong positive that
does not replicate. Read both write-ups in `results.md` before citing either
number, and do not cite the −19.2% on its own.

Round six measured the first *subtraction* — the comment diet, 44% of the source
down to 28% — and found the same wash: +4.3% on the control task, and a −36% on
the other that turned out to be the price of a bug rather than a saving. It did
produce the programme's first concrete finding about a specific line: the diet
deleted the one clause in `packages/web/src` that recorded a coupling, and both
arms that ran without it shipped a broken patch. **Comment volume joins file size
and rationale placement on the list of things that do not drive this cost.**

## The rules that make a measurement mean anything

Learned the hard way; the first experiment broke three of them and had to be
thrown out.

1. **Paired arms.** Run the *same* task against the tree before the change and
   the tree after it. A single "after" number compared to a baseline taken on a
   different task is not a measurement.
2. **A real task, chosen before the result is known.** Pick from the open issue
   backlog on merit. Never build a task to suit the refactor, and never swap the
   task after seeing a number you dislike — the first round's task was chosen
   badly (it straddled the seam being cut) and that flaw is recorded rather than
   corrected, because correcting it retroactively would not have been a
   measurement.
3. **Byte-identical prompts.** The task files here are verbatim. The only thing
   that may differ between arms is the worktree path.
4. **Fresh agents, no prior context.** An agent that has already explored the
   module reads less on a second pass for reasons that have nothing to do with
   the code.
5. **Sequential, never parallel.** Two agents at once contend for CPU and the
   shared vitest cache, which corrupts both the wall-time and the token figures.
6. **Throwaway worktrees, never the live tree.** Merging to `main` triggers a
   deploy that force-checks-out `main` in `/Users/ryan/git/goleta`; an agent
   editing that tree at the same time is a race with no upside.
7. **Discard the result.** The produced change is thrown away. Save the patch
   for reference if it is good — the #220 fix in PR #233 came out of a bench run
   — but it is not the point of the exercise.
8. **Record the negative results.** Every arm so far is in `results.md`,
   including the ones that went backwards and the one where the conclusion was
   wrong.
9. **Record the model and the harness with every arm.** Arms one to five did not,
   and by arm five that was the largest unfalsifiable threat to a result — a
   model change between arms would move a token count on its own and nothing in
   the record would show it. Date, model, and how the agent was dispatched.
10. **An arm is valid only when `main` equals the tree under test.** A bench arm
    is a subagent of a session rooted at the live repo, so Claude Code
    auto-loads *that* `CLAUDE.md` — a symlink to `AGENTS.md` — into the arm's
    context whatever commit its worktree is at. Measure an old tree while `main`
    has moved on and the arm is handed a document its checkout does not have,
    which on one attempt was the very intervention under test. **This harness
    measures forwards and cannot measure backwards.** Instructing the arm to
    prefer the worktree's copy does not help; it cannot unsee what is already in
    context. Take the baseline before doing the work, always.
11. **Do not tune the intervention to the task, either.** Rule 2 stops the task
    being swapped after a number arrives; this is the same hazard from the other
    end. An intervention chosen because a previous arm of *this* task complained
    about it is being measured on the complaint that produced it, which is good
    evidence the mechanism works and weak evidence it generalises. When that has
    happened — round two did it deliberately — say so in `results.md`, and
    confirm the effect on a task the intervention was not shaped around.

## Running an arm

```sh
SP=<some scratch dir>
git worktree add --detach $SP/<name> <commit>
ln -s /Users/ryan/git/goleta/node_modules              $SP/<name>/node_modules
ln -s /Users/ryan/git/goleta/packages/web/node_modules $SP/<name>/packages/web/node_modules

# REQUIRED. Without this the worktree tests the *live repo's* packages.
mkdir -p $SP/<name>/packages/node_modules/@goleta
for pkg in engine server web; do
  ln -sfn ../../$pkg $SP/<name>/packages/node_modules/@goleta/$pkg
done

cd $SP/<name> && npm test        # sanity: the suite must run before the agent starts
```

**Why that third step exists.** The root `node_modules` is a symlink to the live
repo's, and inside it `@goleta/engine → ../../packages/engine` is a *relative*
link — which resolves back through the symlink to
`/Users/ryan/git/goleta/packages/engine`. An arm editing the engine or the server
was silently compiled and tested against a different checkout. It cost one
thrown-out arm before anybody noticed, because a task confined to
`packages/web/src` never trips it: those tests import `../src/…` relatively.
`packages/node_modules` is resolved before the root one, so the links above win.

**Verify it with a canary, not by reading the above.** Rename an exported symbol
in the worktree's engine and typecheck: you should get `packages/server/src/
rooms.ts: Module '"@goleta/engine"' has no exported member`. If that error does
not appear, resolution is still escaping the worktree and any number you take is
worthless.

Then dispatch a **general-purpose subagent** with the task file's contents
verbatim, substituting the worktree path where it says so. Record from the
agent's own completion report: tokens, tool calls, wall time, files read, and
insertions in the produced patch.

Afterwards:

```sh
cd $SP/<name> && git diff > $SP/<task>-<arm>.patch   # keep it
git worktree remove --force $SP/<name> && git worktree prune
```

## Reading the numbers

**Insertions matter as much as tokens.** An arm that spends more and writes more
may simply have done more work — that confound wrecked the first experiment. An
arm that spends more and writes *less* is genuinely more expensive to work in.

**Tool calls and wall time are the sanity check.** When tokens and tool calls
disagree in direction, be suspicious of both.

**One sample per arm resolves very little, and the noise floor is far higher
than this file used to claim.** It said "treat anything under about 5% as noise".
Round six measured it directly: two arms of `task-259-pile-side.md`, on trees
differing **only in `bench/results.md`**, with a byte-identical prompt and the
same model, came out **85,094 and 109,694 — a 29% spread**. The variance is not
in the reading; it is in the *outcome*, because one arm found a hidden coupling
and the other shipped a bug. **Treat anything under about 25% on a single pair as
noise, and do not report a delta without saying whether both arms produced a
correct patch.** The conclusions in `results.md` rest on arms agreeing about
*direction* and on what the agents said about *where* their time went, not on any
single figure.

**Agreement across metrics is worth more than any one of them.** The four
structural arms had tokens and tool calls pointing different ways; arm five
moved tokens, tool calls, wall time and insertions together, which is the only
reason one sample was worth reporting as a result at all.

**Read the NOTES section of every report.** It has been more informative than
the numbers every single time. Every arm has named a costliest file, and the
sequence of those names is what actually produced round one's conclusion.

## The tasks

| File | Status |
| --- | --- |
| `task-220-picker.md` | **Current.** Five arms recorded. Keep using it — the series is only comparable if the task does not change. But see rule 11: round two's intervention was shaped by this task's own complaints, and its −19.2% did not reproduce on the second task. |
| `task-222-lockout.md` | **Current, paired.** Two arms, `9cffd68` vs `79c6619`, flat (−1.4%). Written as round two's rule-10 control. A rename, so it needs little constraint-assembly, and it is centred on `packages/engine` which no round of this work has touched — read it as a weak test rather than a verdict. |
| `task-257-sun-quiet.md` | **Current, paired.** Two arms, `e6a85b4` vs `4b79b37` (+23.9%). A placement task, and the one that caught #230's placement map failing on its own ground. |
| `task-259-pile-side.md` | **Current. Four arms**, across `e6a85b4`, `4b79b37`, `4628866` and `6a8c9d6` — the longest-running paired task here. **Read round six before quoting any of its numbers**: the arms separate cleanly by whether they found the `SunnyPeel` coupling and not at all by tree, and two arms on byte-identical code came out 29% apart. Deliberately worded without naming files, so it stays one task across trees with different layouts. Keep it that way. |
| `task-243-roomcode.md` | **Current, paired.** Two arms, `4628866` vs `6a8c9d6` (+4.3%). Round six's low-constraint control, and it behaved like one. |
| `task-you-are-next.md` | Superseded. Two arms. A synthetic feature, and it straddled the seam under test — see `results.md`. |

**Before writing a new task file, `ls bench/`.** This table went stale once and a
duplicate `task-259-*.md` was written against an issue that already had one — see
round six. The directory is the authority; this table is a convenience.

**Do not merge PR #233 while `task-220-picker.md` is the benchmark**: it fixes
the very bug the task asks the agent to fix, and merging it destroys the series.
