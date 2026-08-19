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
