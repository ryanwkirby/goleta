# Benchmark task — the accusation picker (#220)

**The prompt below is verbatim and must not be edited.** Four arms have been run
against it (see `results.md`); the series is only comparable while the words stay
the same. Substitute the worktree path on the first line and change nothing else.

If this task ever has to be retired — because #233 lands, or because the bug is
fixed some other way — start a **new** file and a **new** baseline rather than
amending this one.

One known inaccuracy, deliberately left in: the prompt says a grep for
`activeSuit` returns no readers, and `SunnyPeel` has always read
`evidence.activeSuit`. It was equally wrong for all four arms, so it biases
nothing; fixing it now would break comparability.

---

```
Work ONLY in the repo at <WORKTREE PATH>

That is a full checkout of a card-game monorepo. Do not touch any other directory on this machine, and in particular never touch /Users/ryan/git/goleta.

# The task

Fix this bug.

## The accusation picker never shows the board the call is judged against

In this game ("reversed Crazy Eights"), drawing a card when you had a legal play is an offence, and another player may accuse you — the "Sunny Rule". To accuse, you must name the specific card the offender should have played.

A call is judged against the board **as it stood at the instant of the offending reach**. The engine sends the accuser a `SunnyReach` object, which carries three fields:

```ts
export interface SunnyReach {
  hand: Card[];        // the offender's hand at the moment of the reach
  activeSuit: Suit;    // the suit that had to be matched then
  topRank: Rank;       // the rank in play then
}
```

`SunnyAccusePicker` renders `reach.hand` and nothing else. A grep for `activeSuit` or `topRank` across `packages/web/src` returns no readers at all.

So the picker asks you to work out which card was legal while showing you only half of what "legal" is measured against. Players supply the other half by looking at the pile — and the pile is frequently no longer the pile the call is judged against, because the challenge window deliberately outlives the turn: it closes when the *next* player acts, so the offender routinely draws and then plays before anybody accuses.

Worked example:

```
board: 5S. Bo holds 8D and 9C — the 8 is playable, so drawing is an offence.

Bo reaches for the deck            the offence; the sun appears beside Bo
Bo plays the 8D and names clubs    pile now shows 8D, active suit clubs
                                   window still open: nobody else has acted

you tap the sun
  picker offers:       [ 8D, 9C ]
  you see on the pile:  8D, clubs
  judged against:       S / 5      <- never shown to you

you name the 9C, because it is a club and clubs are what is in play
  -> correct: false  -> you eat a three-draw lockout, and Bo walks
```

This punishes the player who read the table correctly. An 8 makes it worse than a coin flip, because the whole point of an 8 is that the player names a suit nobody expects — so the board after the offence is maximally unlike the board before it.

## What to build

Show, inside the accusation picker, the board the call will actually be judged against: the rank that was in play and the suit that had to be matched, from `reach.topRank` and `reach.activeSuit`.

It must appear in **both** layouts the picker is rendered in — the full upright table and the compact landscape one — and it must be legible in the compact one, which has much less vertical room.

## Constraints — an implementation that breaks one of these has not done the task

These are existing, deliberate rules of this codebase. Read `AGENTS.md` in the repo root for the surrounding reasoning.

- **Nothing may say which card was legal.** Do not add a "legal cards" highlight to the picker, do not sort the offender's hand helpfully, and do not dim or disable the cards that would not have played. The accuser works that out themselves; that is the whole point of the rule.
- **Nothing may indicate whether a call would land**, or whether the accusation being composed is correct.
- **Presentation only.** No change to `packages/engine` or `packages/server`, nothing new on the wire, no new protocol message. Every field you need is already being sent.
- Match the surrounding visual register — this is a panel of cards over a green felt table, and the app draws suits with existing helpers rather than raw characters. Find and reuse what is already there.

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
