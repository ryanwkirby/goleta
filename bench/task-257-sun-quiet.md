# Benchmark task — quieting the Sunny call offer (#257)

**The prompt below is verbatim and must not be edited.** Substitute the worktree
path on the first line and change nothing else.

The second task of the whole-programme comparison, run alongside
`task-259-pile-side.md` on the same pair of trees (`e6a85b4` vs `main`).

**Worded behaviourally.** At `e6a85b4` this control has no component of its own —
it was extracted during the refactor — so the prompt describes what is on screen
rather than naming a file that exists on only one arm.

Chosen on merit from the M4 backlog, and chosen because it is a **placement**
problem with converging constraints, which is what round one's placement map
(#230) and round two's signposts (#235) both claim to make cheaper. If the
programme helps anywhere, it should help here.

Scope includes `AGENTS.md` because the issue's own acceptance criteria require
the map to be updated. Both arms have that document; only its length differs,
which is part of what is under test.

**Strip the measurement artefacts from the after tree** before running — see the
note in `task-259-pile-side.md`.

---

```
Work ONLY in the repo at <WORKTREE PATH>

That is a full checkout of a card-game monorepo. Do not touch any other directory on this machine, and in particular never touch /Users/ryan/git/goleta.

# The task

Make this change.

## The call offer is the loudest thing on the felt, for the rarest action

In this game ("reversed Crazy Eights"), drawing a card when you had a legal play is an offence, and another player may accuse you — the "Sunny Rule". The control that starts an accusation is a pill laid over the felt near your own cards: a 24px sun glyph, then the words **call it on <name>** at small-semibold weight in amber, on a near-black ring. It is pinned to the **left** in both phone layouts.

It was made big deliberately, because it used to be a 20px circle wedged into a sideways-scrolling strip of seats and a missed tap was usually a missed call. That was right. It overshot on presence: the window to accuse opens on **every draw**, which is most turns of most games, so this pill is on screen almost constantly — amber, bold, and the widest thing over the felt — for something that is correctly used rarely.

It should be a target you can mash without aiming, and nearly invisible until you want it.

## What to build

- **Right-aligned**, not left. Most people are right-handed, and this is the one control whose window closes when somebody else moves.
- **Much smaller text: just the player's name**, no "call it on", sitting **under** the sun rather than beside it — so it reads as a sun with a name under it, rather than a sentence with a sun in front of it.
- **Not amber.** The same light grey the rest of the app's small print uses. Amber at this table means *the game is waiting on you*, and this is not that.

**The tap target does not shrink.** 44px stays the floor. This is a smaller-looking control, not a smaller one: the sun does the work of being findable and the name does the work of saying who.

## The placement problem, which you have to settle rather than discover

Right-aligning it in the landscape layout runs straight into the reason it was placed where it is. That layout's draw pile sits at the **right-hand end** of its top row, and this control was deliberately hung at the far end from the deck, because a fat target beside the deck is a mis-tap into the exact offence it accuses.

So the offer must not end up adjacent to the draw pile. Work out where it can go from the constraints the repo already records, and say in your report which ones decided it.

## What must not change

These are existing, deliberate rules. Read `AGENTS.md` in the repo root for the reasoning.

- **One appearance.** No brightening, no ramp, no ordering, no wording that varies with whether an accusation would actually succeed. No client is ever told that and none ever will be.
- **The disabled variant stays**, for a caller serving out their own penalty for a previous wrong accusation, and it stays invisible to everyone else.
- **Tapping it opens the card picker and does not accuse.** It still signals that an accusation is being composed, which pauses the computer players.
- **It still names exactly one person.** A bare name under a sun does that; a nameless sun would not.
- **Presentation only.** No change to `packages/engine` or `packages/server`, nothing new on the wire.

## Done means

From the repo root of that worktree:
- `npm test` passes
- `npm run lint` passes
- `npm run typecheck` passes

And `AGENTS.md` describes where the control actually is, if it says anything about where it is.

# Rules

- Do NOT commit, push, or open a PR.
- Do NOT start a dev server or a browser.
- Only edit files under `packages/web/src`, plus `AGENTS.md`.

# Report

End your final message with a section headed exactly `## BENCH REPORT` containing:

1. `FILES READ:` every source file you opened or grepped the contents of, one per line, in the order you first read them. Be complete and honest — this is a measurement and an incomplete list invalidates it.
2. `FILES EDITED:` the files you changed.
3. `TEST RESULT:` final pass/fail of test, lint and typecheck.
4. `NOTES:` what made this harder than it needed to be. Specifically: how much of what you read turned out to be irrelevant, which single file cost you the most to understand, and what you had to hold in your head at once to make the change safely.
```
