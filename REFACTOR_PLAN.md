# REFACTOR_PLAN.md — round two

**Read `REFACTOR_FINDINGS.md` first, then `bench/results.md`.** This plan only
makes sense against them, and its central instruction is a negative one that
will otherwise look like an oversight.

Round one's plan is in the git history at `6b3f635`; every step of it shipped.

---

## The goal, stated so it can fail

Round one asked whether shrinking the largest file makes the next change
cheaper. Measured four times: **no** (−0.3%).

Round two asks a different question. Every arm reported that its cost was
**assembling interlocking constraints**, not finding code — and the one
intervention that improved a measurement against the state it followed was
#229/#230, which moved *prose* rather than code (−7.5% tokens, −21% tool calls).

So: **does putting constraints where the code is make the next change cheaper?**

If the answer is no again, that is a real answer and the honest response is to
stop optimising for this and spend the effort on the feature backlog. Two
rounds of negative results is enough to conclude the codebase is about as cheap
to work in as its subject matter allows.

## The rule this round runs on

**Do not split any file for size.** Tried twice, in both shapes, neither moved
the total, and the cohesive split made things 11% worse. Splitting for
**cohesion** — one file doing two genuinely unrelated jobs — remains ordinary
good practice, but do it because it is right, not because it is expected to pay,
and do not count it as part of this experiment.

## The work

Three issues, and they are deliberately in this order.

### #235 — constraints next to the code they constrain

The substance of the round. At least five prohibitions govern
`SunnyAccusePicker` and every one lives in `AGENTS.md`; an agent editing that
file has no way to know they exist. Same for the draw pile in `Piles.tsx`, which
implements the single most load-bearing rule in the app and does not say so.

A **signpost, not a copy**. `AGENTS.md` stays the authority; if a note and the
document disagree, the document wins and the note is stale. Do not restate
arguments — that is the exact failure #229 was filed for.

### #236 — answer load-bearing questions in code, not prose

*"Is this column measured or fixed?"* cost an agent 240 lines of comment prose,
and the answer is a `useBox` call. `PileSuit`'s `named` variant has now trapped
two agents on a semantic that exists only in a doc comment.

Not an argument for fewer comments. An argument that some of what the prose
carries is a fact the code could state itself.

### #237 — write the negative result into `AGENTS.md`

So the next person reasoning from first principles does not re-run round one.
Include the churn mis-step: the target was picked because 48 of 233 commits had
touched it, and churn did not predict where the work was.

## Measuring it

`bench/README.md` has the protocol and the rules. In short:

1. **Baseline first**, on `main` before any of #235/#236/#237 lands, using
   `bench/task-220-picker.md` **verbatim**. There are already four arms on that
   task; a fifth is comparable only if the words do not change.
2. Do the work. One issue per commit, PR per logical group, CI green.
3. **Re-run the identical task** on the merged result.
4. Record both in `bench/results.md`, including the direction it went.

**Do not merge PR #233** while this task is the benchmark — it fixes the very bug
the task asks the agent to fix.

Interpretation, from `bench/README.md`: treat anything under ~5% as noise, read
the NOTES section of every report (more informative than the numbers, every
time), and check insertions as well as tokens — an arm that spends more and
writes more may just have done more work.

## What is out of scope

- **`packages/engine`.** Pure, heavily tested, the good part.
- **`rules.ts` and `rooms.ts`.** Over 500 lines and genuinely fine.
- **Splitting anything for size.** See above.
- **Deleting rationale.** 42% of source is comments and they are load-bearing.
  The problem is that some facts live *only* in prose and some prose lives far
  from what it governs — not that the prose exists.
- **The risk-pass items** listed at the foot of `REFACTOR_FINDINGS.md` — dead
  exports, missing runtime validation on `ClientMessage`, no rate limiting.
  Real, all low severity, and each is a behaviour change that belongs in its own
  PR with a test that fails before and passes after. Not refactoring.

## Standing conventions

- **Language / runtime:** TypeScript ~6.0 on Node ≥24, ESM throughout, npm
  workspaces monorepo, one Docker image, one process.
- **Test command:** `npm test` (391 → 490 tests, ~1.6s). Keep it fast; the
  iteration loop is this repo's best asset. Scoped: `npx vitest run packages/web/test`.
- **Also required:** `npm run lint` (oxlint), `npm run typecheck` (two tsconfig
  projects), `npm run build`. CI gates all four plus a Docker build.
- **No formatter is configured** and the repo is *not* prettier-clean. Do not run
  prettier; match surrounding style by hand.
- **Public interfaces that must not change:** `packages/engine/src/protocol.ts`
  (the wire contract), `packages/engine/src/index.ts`,
  `packages/engine/src/redact.ts` (the security boundary — any new field on game
  state defaults to *not* being sent), and the room snapshot shape in
  `persist.ts` (changing it means bumping `SNAPSHOT_VERSION`; never write a
  migration).
- **Import direction is enforced by a test**: `lib → net → components → motion →
  screens`, `lib` a leaf. See `packages/web/test/imports.test.ts`.
- **Workflow:** issue first, branch off `main`, one commit per logical step, PR,
  CI green, merge. Squash a single-issue PR; merge-commit a multi-issue one.
  Merging to `main` **deploys to the live site** via a self-hosted runner that
  force-checks-out `main` in `/Users/ryan/git/goleta` — never touch that tree
  while a run is in flight, and let the health check finish rather than
  rebuilding by hand.
- **Known-broken behaviour that is load-bearing:** `AGENTS.md` § "Rules that look
  like bugs and are not", in full. The three most likely to be broken by
  accident: the draw pile stays tappable when you hold a legal play with no
  warning; the app never highlights anyone's legal cards except under `assist`;
  and whether a draw was illegal never leaves the server.
