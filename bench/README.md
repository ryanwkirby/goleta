# bench/ — measuring what a change costs

The question this directory exists to answer: **does a given refactor make the
next real change cheaper?**

Round one answered it for four interventions, and the answer was no. The whole
record is in `results.md`; read it before proposing another. The short version
is that splitting files for size was measured twice, in both shapes, and moved
the total by −0.3%, while consolidating scattered rationale moved it −7.5%
against the state it followed.

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

## Running an arm

```sh
SP=<some scratch dir>
git worktree add --detach $SP/<name> <commit>
ln -s /Users/ryan/git/goleta/node_modules              $SP/<name>/node_modules
ln -s /Users/ryan/git/goleta/packages/web/node_modules $SP/<name>/packages/web/node_modules
cd $SP/<name> && npm test        # sanity: the suite must run before the agent starts
```

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

**One sample per arm resolves very little.** Treat anything under about 5% as
noise. The conclusions in `results.md` rest on four arms agreeing about
*direction* and on what the agents said about *where* their time went, not on
any single figure.

**Read the NOTES section of every report.** It has been more informative than
the numbers every single time. Every arm has named a costliest file, and the
sequence of those names is what actually produced round one's conclusion.

## The tasks

| File | Status |
| --- | --- |
| `task-220-picker.md` | **Current.** Four arms recorded. Keep using it — the series is only comparable if the task does not change. |
| `task-you-are-next.md` | Superseded. Two arms. A synthetic feature, and it straddled the seam under test — see `results.md`. |

**Do not merge PR #233 while `task-220-picker.md` is the benchmark**: it fixes
the very bug the task asks the agent to fix, and merging it destroys the series.
