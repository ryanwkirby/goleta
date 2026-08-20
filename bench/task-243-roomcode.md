# Benchmark task — the room code as a copy control (#243)

**The prompt below is verbatim and must not be edited.** Substitute the worktree
path on the first line and change nothing else.

Written as the **low-constraint arm** of round six, which measures the comment
diet (#264 / PR #265). Round six's pair is deliberately mismatched in shape:
this task is two components, crisp acceptance criteria, and almost nothing in
`AGENTS.md` bearing on it, while its partner — `task-259-pile-side.md`, which
already had three arms behind it — is one shared component with a dense
constraint set. If a subtraction of comments helps or hurts, the two should not
move together.

It behaved like a control: +4.3%, inside noise, with the after arm doing more
work than the before arm. The interesting half of round six is all on #259.

Chosen on merit from the backlog filed on 2026-08-20, before any arm was run.

**No line numbers appear in the prompt, and that is deliberate.** The
intervention under test removes several hundred lines of comments from the two
files this task edits, so any line reference true of one arm is false in the
other. Symbols and filenames are stable across the range; line numbers are not,
and citing them would have handed the `before` arm working directions and the
`after` arm a wild goose chase.

---

```
Work ONLY in the repo at <WORKTREE PATH>

That is a full checkout of a card-game monorepo. Do not touch any other directory on this machine, and in particular never touch /Users/ryan/git/goleta.

# The task

Fix this bug.

## Tapping the room code does nothing, on a screen that tells you to tap codes

A room in this app is addressed by a four-character code. In the lobby, the `RoomCode` component in `packages/web/src/screens/Lobby.tsx` draws those four characters at `text-5xl` in amber, with a small grey **Copy invite link** button underneath. The code is by far the biggest thing on the screen and the thing a host reaches for, and it does nothing at all when tapped. The button under it is the only way to copy the link.

Two other places in the app already say *tap it to copy* about a code — the QR caption in the lobby and the shared-screen dialog — so the app is already telling people to do the thing that does not work here.

The in-game invite panel, `packages/web/src/components/RoomInvite.tsx`, draws the code the same way and has the same gap.

## What to build

**Make the code itself the copy control**, in both places, with the same feedback the button already gives.

- Tapping the code copies the invite link — the same one the button copies, not a different one.
- The **Copy invite link** button changes to **Link copied** for the same duration it does today, whichever of the two was tapped. One piece of state, two triggers.
- The button stays. It is the labelled path, and the one that says what tapping the code will do; removing it would leave the affordance unannounced.

## Constraints — an implementation that breaks one of these has not done the task

These are existing, deliberate rules of this codebase. `AGENTS.md` in the repo root has the surrounding reasoning.

- **It has to be a real control, not a click handler on a paragraph**: keyboard reachable and operable, with an accessible name saying what it copies.
- **One copy path.** The existing helper already swallows a clipboard failure and leaves the copied flag false. Both entry points go through it rather than growing a second one.
- **Anybody may copy, not just the host.** Handing somebody the way in is not a host power here, and nothing behind it changes the room.
- **The code stays legible at reading-out size.** "What's the code?" across a table is how this actually goes, so whatever you wrap the characters in must not shrink them, restyle them as a button, or change what the panel leads with.
- **No change to the room, the protocol or the server.** This is presentation.

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
