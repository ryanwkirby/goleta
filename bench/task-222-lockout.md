# Benchmark task — the Sunny lockout's unit (#222)

**The prompt below is verbatim and must not be edited.** Substitute the worktree
path on the first line and change nothing else.

Written as the **second task** for round two, per rule 10: `task-220-picker.md`
had been run four times before round two's intervention was designed, and two of
that intervention's three parts were chosen because arms of that task complained
about them. A number from a task the work was shaped around is evidence the
mechanism works, not that it generalises.

Chosen on merit from the open backlog, and chosen because it is the **only** open
issue that lands in the four files round two put headers on. That is itself worth
recording: the pilot was narrow, so the set of tasks that can fairly test it is
small. It is a thinner task than #220 — more renaming, less design — so expect
lower resolution and read insertions carefully.

Unlike `task-220-picker.md` this one may edit outside `packages/web/src`: the
concept it renames lives in the engine and the canonical document. Both arms
face identical code, so the wider scope biases neither.

---

```
Work ONLY in the repo at <WORKTREE PATH>

That is a full checkout of a card-game monorepo. Do not touch any other directory on this machine, and in particular never touch /Users/ryan/git/goleta.

# The task

Fix this bug.

## The Sunny lockout counts reaches; the canonical rules say cards drawn

In this game ("reversed Crazy Eights"), drawing a card when you had a legal play is an offence, and another player may accuse you — the "Sunny Rule". A wrong accusation costs the caller no cards; it locks them out of calling for a while.

`docs/RULES.md` is the canonical statement of the rules. It describes that lockout as lifting once:

> **three more cards have been drawn** at the table

The engine counts something else. In `recordDraw`:

```ts
s.totalDraws += 1;
if (card) challenge.drawnIds.push(card.id);
```

`card` is `null` on a reach that emptied the deck and recycled the pile instead of putting a card in a hand. That reach still increments `totalDraws`, so it ticks every outstanding lockout down by one while no card moved anywhere.

At a table with a thin deck a lockout can therefore expire having watched three reaches and zero cards drawn. Rare, and nobody is harmed by it — but `AGENTS.md` is explicit that when the code and `docs/RULES.md` disagree, that is a bug in whichever one is newer, and here the newer thing is the code.

## What to build

**Fix the wording, not the counting.** Counting reaches is the better rule and was settled deliberately: the lockout is a penalty measured against people going to the deck, and a recycle is unambiguously somebody going to the deck. It also keeps one counter meaning exactly one thing.

So make the language match the behaviour, everywhere the behaviour is described:

- `docs/RULES.md` should describe the lockout in terms of what is actually counted.
- The in-app wording should match it: the locked-out caller's control, and the counter shown to a player serving a lockout.
- `SUNNY_LOCKOUT_DRAWS` and `sunnyLockedDraws` should read consistently with whichever word wins, or be renamed to it.

Pick the word the rest of the documentation already uses for this thing and use it consistently. Do not introduce a second word for one concept.

## Constraints — an implementation that breaks one of these has not done the task

These are existing, deliberate rules of this codebase. Read `AGENTS.md` in the repo root for the surrounding reasoning.

- **A lockout is visible only to the player serving it.** Nothing you change may show one caller's lockout to anybody else, on any screen, in any wording. This is a redaction property, not a presentation preference.
- **Nothing may indicate whether a call would land**, or separate a legal draw from an illegal one.
- **Do not change what is counted.** No behavioural change to the lockout, the counter, or when it lifts. This is a naming and documentation change; the engine's arithmetic stays exactly as it is.
- **A rename must be complete.** One concept, one word, across the canonical document, the engine, the server and the browser. Leaving two names for one thing is worse than leaving the original one.

## Done means

From the repo root of that worktree:
- `npm test` passes
- `npm run lint` passes
- `npm run typecheck` passes

# Rules

- Do NOT commit, push, or open a PR.
- Do NOT start a dev server or a browser.
- You may edit under `packages/*/src`, `packages/*/test` and `docs/`.

# Report

End your final message with a section headed exactly `## BENCH REPORT` containing:

1. `FILES READ:` every source file you opened or grepped the contents of, one per line, in the order you first read them. Be complete and honest — this is a measurement and an incomplete list invalidates it.
2. `FILES EDITED:` the files you changed.
3. `TEST RESULT:` final pass/fail of test, lint and typecheck.
4. `NOTES:` what made this harder than it needed to be. Specifically: how much of what you read turned out to be irrelevant, which single file cost you the most to understand, and what you had to hold in your head at once to make the change safely.
```
