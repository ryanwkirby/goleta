# REFACTOR_PLAN.md

Phase 3 plan for `goleta`. **Plan only — nothing in this document has been done.**

Follows `REFACTOR_FINDINGS.md` and the four decisions taken at Gate 0:

| Decision | Choice |
| --- | --- |
| Safety net | Extract-and-test as we go, using the repo's existing `node` test setup. No new dependencies. |
| Starting point | Warm up on `net/identity.ts`, then the real target `screens/Table.tsx`. |
| Benchmark | Measure once now, once at the end. |
| Git | One PR per phase; each step its own commit on the branch. One deploy. |

---

## The metric

Primary: **code lines in the largest file**, not total lines. 42% of this
repo's source is design rationale carrying issue numbers, and `AGENTS.md`
exists to stop a future agent "fixing" deliberate behaviour. Every extraction
below **moves its comment block with the code**. No step earns its number by
deleting prose.

| | Now | Target after Step 5 |
| --- | ---: | ---: |
| `Table.tsx` total lines | 1,016 | ~340 |
| `Table.tsx` code lines | 558 | ~200 |
| Largest single function | 899 | ~150 |
| `Table.tsx` files with tests | 0 | 4 new tested modules |
| Test suite runtime | 1.6s | ≤2.0s |
| New dependencies | — | **0** |

---

## Ordering

The protocol's ordering is not negotiable and this plan follows it:
boilerplate → cohesive extractions → parameter objects → *only then* file
splits → tests co-located. Steps 0–2 exist to set up Step 5; Step 5 is where
the metric actually moves.

Every step: clean tree before, `npm test && npm run lint && npm run typecheck`
green before and after, one commit, independently revertable, and **stop and
report** before the next.

---

## Step 0 — `net/identity.ts`: fold 17 copies of one guard into three helpers

**Refactoring:** Extract Function (6.1), then Replace Inline Code with Function
Call (8.5).

**Why this file first.** Clearest boundary in the repo, no hidden logic, and it
is the one place where the protocol's Phase 1 can be done *properly* — tests
strictly before structure — because the module's public surface is 17 plain
functions that are not going to move. It proves the process and it proves the
testing approach before either is spent on `Table.tsx`.

**Today.** Every accessor is `try { localStorage… } catch { fallback }`, written
out 17 times. 8 reads, 9 writes. A `readJson<T>` helper already exists doing
exactly this for one case — the pattern is established, it just was not applied.

**Change.** Add `readLocal(key): string | null`, `writeLocal(key, value): void`,
`removeLocal(key): void`, each owning the `try/catch`. Rewrite all 17 accessors
over them:

```ts
export const loadName = (): string => readLocal(NAME_KEY) ?? "";
export const hasSeenRules = (): boolean => readLocal(RULES_KEY) === "1";
export const markRulesSeen = (): void => writeLocal(RULES_KEY, "1");
export const wantsHints = (): boolean => readLocal(HINTS_KEY) !== "0";
```

**Call sites touched outside the file: none.** Every exported function keeps its
name, signature and behaviour exactly. That is what makes this safe and what
makes it the right warm-up.

**Commits:** two.
1. `test: characterize identity.ts against localStorage (Phase 1)`
2. `refactor: extract readLocal/writeLocal in identity.ts (Replace Inline Code with Function Call)`

**Test that proves it.** New `packages/web/test/identity.test.ts`, written first
and passing against the *unrefactored* file. Stubs `globalThis.localStorage`
with a plain object — the suite runs in `environment: "node"`, so there is no
real one, and no dependency is needed to fake it. Covers, for every accessor:
the normal read, the absent-key fallback, the malformed-value fallback, and
**the throwing-localStorage case** (private browsing / full quota), which is the
entire reason the 17 guards exist and which nothing tests today.

**Line delta.** `identity.ts` 260 → ~205 total, 135 → ~85 code. All 96 comment
lines stay. New test file ~+110.

**Risk.** Low. Behaviour-identical by construction, and the new tests pin it
from both sides.

---

## Step 1 — break the three import cycles

**Refactoring:** Move Function (8.1) / Move Field.

**Why.** `web/src` has three directory-level cycles: `components ↔ lib`,
`components ↔ motion`, `lib ↔ net`. There are no cycles at file level — the
whole thing is caused by four pure values living inside impure modules. Every
extraction in Step 3 puts new logic into `lib/`, and several of those need card
geometry; done today that would deepen the cycle rather than not.

**Change.**

| Move | From | To |
| --- | --- | --- |
| `CARD_WIDTH_PX`, `CARD_HEIGHT_PX`, `CARD_SHAPE`, `CardSize`, `cardWidthAt` | `components/Card.tsx` | `lib/cardShape.ts` |
| `SUIT_GLYPH`, `SUIT_LABEL` | `components/Card.tsx` | `lib/cardShape.ts` |
| `PEEL_MS`, `RESHUFFLE_MS`, `RESHUFFLE_CARDS`, `RESHUFFLE_BEAT_MS` | `motion/plan.ts` | `lib/beats.ts` |
| `LoggedEvent`, `Shout`, `GoletaError`, `ConnectionStatus` | `net/useGoleta.ts` | `net/types.ts` |

`components/Card.tsx` and `motion/plan.ts` re-export what they moved, so no
consumer outside changes in this step.

**Call sites.** ~15 import lines across `lib/format.ts`, `lib/pileBox.ts`,
`lib/judgedCall.ts`, `lib/reshuffle.ts`, `lib/handFan.ts`, `motion/plan.ts`,
`motion/TableMotion.tsx`, `net/identity.ts`, and the two test files that import
`CARD_*` directly (`handFan.test.ts`, `pileBox.test.ts`).

**Test.** Existing tests unchanged and still green — that *is* the proof, since
this step is definitionally behaviour-free. `typecheck` is the real gate.

**Line delta.** ~0 net. Two new files (~60 lines each, mostly moved comments).

**Risk.** Low but broad — many files, zero logic. Pure mechanical; `tsc` catches
any mistake immediately. **Deferrable**: if you would rather not have the churn,
Step 3 still works, it just leaves the cycles in place.

---

## Step 2 — the pieces both table layouts draw

**Refactoring:** Extract Function (6.1), as React components.

**Why.** `Table.tsx` (upright) and `HandView.tsx` (landscape) are deliberately
separate layouts and must stay separate — but they render the same pieces from
the same state, and two of those pieces encode a documented invariant that is
currently written down twice and enforced nowhere.

**Change.** Extract two components into `components/`:

- **`HandFrame`** — the turn ring + `MoveRefusal` + children wrapper. Byte-
  identical in both files today (`Table.tsx:942–953`, `HandView.tsx:306–310`).
  `AGENTS.md` requires that turning the phone never moves where a refusal
  appears (#99); one component makes that structural instead of a coincidence.
- **`SunnyCallOffer`** — the pinned `SunnyCall` wrapper. Same content in both
  (`Table.tsx:897–906`, `HandView.tsx:209–220`), differing only in placement
  classes, which stay at each call site as a `className` prop. The two files
  currently carry near-identical prose arguing the same point twice.

**Explicitly not extracted:** the two docked pickers and the sort/help cluster.
Their placement differs for reasons `AGENTS.md` argues at length (#167, #131),
and a shared component would have to take so much positioning that it would
save nothing and hide the argument.

**Line delta.** `Table.tsx` −25, `HandView.tsx` −20, two new files +~70 (the
prose consolidates).

**Test.** Existing suite green. No behavioural surface to add a test to without
a DOM renderer; this step is a wash on coverage and is justified by the
invariant, not the metric.

---

## Step 3 — lift `Table.tsx`'s decisions into tested pure modules

**Refactoring:** Extract Class (7.5), realised as pure modules — this codebase
has no classes, and `lib/` modules are its equivalent.

**This is the step that matters.** `Table.tsx`'s top ~440 lines are derivation:
working out what is going on before drawing anything. This repo already has a
strong convention of putting exactly that in `lib/` as small tested modules —
`judgedCall.ts`, `reshuffle.ts`, `handFan.ts`, `seating.ts`, `facing.ts` are all
this. `Table.tsx` simply never got the treatment. Extracting it *creates* the
testable boundary rather than mocking around one.

Four sub-steps, **four separate commits**, each with its own test file.

### 3a — `lib/tableRoute.ts` — which of five screens to draw

The highest-value extraction in the plan. `Table.tsx` has four early returns
guarded by `takeYourSeat`, `irlPhone && portrait && rotatedFor`, `handOver` and
`compact`, built on `judging`, `seated`, `finished`, `phone` and `portrait`.

It is the most subtle logic in the file — the `!finished` condition alone
carries a paragraph explaining that `room.gamesPlayed` moves at *game over*, so
a version that stayed true one event longer would silently stop the rotate
prompt ever firing again — and it has **zero tests**.

Pure function over plain values returning a discriminated union:

```ts
type TableRoute =
  | { kind: "takeYourSeat"; shuffleEntryId: number }
  | { kind: "rotate" }
  | { kind: "handOver" }
  | { kind: "compact" }
  | { kind: "full" };
```

**Test:** `packages/web/test/tableRoute.test.ts` — the precedence order, the
once-per-deal rotate bookkeeping, a watcher never getting `compact`, and a
judged call holding the full table in both orientations.

**Line delta:** ~80 out of `Table.tsx`.

### 3b — `lib/handMode.ts` — the hand's mode, and `assist`

The `mode: HandMode` ternary chain and the three-source `assist` expression.
`assist` is the single most rules-sensitive line in the file — `AGENTS.md` has a
long bullet on it (#187, #33) — and it is currently one unguarded boolean
expression in the middle of a 900-line component.

**Test:** each of the four modes; `assist` true for a forced play after a landed
call, for the standing preference, and for one bought turn, and **false**
otherwise. That last assertion is the one worth having.

**Line delta:** ~35 out.

### 3c — `lib/sunnyOffer.ts` — the call window and the caught dialog

`sunnyTarget`, `stillAccusable`, `caughtYou`, `caughtHold`, `showCaught`.

**Test:** the offer disappearing when the picker opens; the window closing when
somebody else acts; the offender's dialog waiting for the peel and then for an
acknowledgement.

**Line delta:** ~40 out.

### 3d — `lib/graduation.ts` — whether to ask after a first finished game

Joins the already-tested `gamesToCredit`. Small, but it completes a cluster that
is currently split between a tested helper and an untested layout effect.

**Line delta:** ~15 out.

**Step 3 total: ~170 lines out of `Table.tsx`, four new tested modules, no new
dependencies, suite still under two seconds.**

---

## Step 4 — bundle `HandView`'s 30 props

**Refactoring:** Introduce Parameter Object.

`HandViewProps` has 30 members and the call site in `Table.tsx` is 35
consecutive lines of prop-passing. Group into four coherent bundles — `table`
(room, game, nameOf, send, offline), `hand` (cards, mode, assist, onChooseCard,
refusal, handSort, onCycleSort), `sunny` (accusing, stillAccusable, sunnyTarget
and the three callbacks), `self` (hints, onChooseHints, shouting, stalled,
onAskForHelp, helpFrom).

**Line delta:** `Table.tsx` −25; `HandView.tsx` interface restructured, roughly
flat.

**Test:** existing suite green; `typecheck` is the real gate.

**This is the most debatable step in the plan.** Prop bundles trade a long list
for a layer of indirection, and at 30 props I judge the trade worth it — but it
is the one step I would drop first if you disagree, and nothing downstream
depends on it.

---

## Step 5 — split `Table.tsx` along the seams the first four steps exposed

**Refactoring:** Extract Function (6.1) / Move Function (8.1).

**Only now.** By this point `Table.tsx` is ~800 lines with its decisions gone
and its shared pieces extracted, and what is left is a state layer plus two JSX
trees. The seams are visible rather than guessed at, which is the whole reason
this step is last.

New directory `screens/table/`:

| New file | What moves | ~lines |
| --- | --- | ---: |
| `TableOverlays.tsx` | The `SunnyExplainer` / `RoomInvite` / `Graduation` / `SunnyAnnounce` / `SunnyCaught` stack. **The `SunnyExplainer` block is currently written out three times in `Table.tsx` and `RoomInvite` twice** — this collapses all five. | ~120 |
| `TableHeader.tsx` | The header row: both cogs, the QR invite glyph, rules, leave. | ~90 |
| `GameOverPanel.tsx` | The finished-game panel and the join-next-game offer. | ~70 |
| `FullTable.tsx` | The upright layout body. | ~180 |

`Table.tsx` keeps the state, the effects, the handlers, the route from 3a, and
the composition — the thing that is genuinely one component's job.

**Line delta:** `Table.tsx` ~800 → **~340 total / ~200 code**. Total across the
new files roughly flat, which is the expected and correct outcome.

**Test:** existing suite green. The safety for this step comes from Step 3
having already pulled every *decision* out into something tested — what moves
here is markup.

---

## Step 6 — the settings controls (independent; take it or leave it)

**Refactoring:** Extract Function (6.1).

Three near-identical two-button choosers (`BotSpeedPicker` in `Lobby.tsx`,
`DealerPicker` and `IrlToggle` in `HostSettings.tsx` — the first two are
line-for-line identical apart from a constant array and a heading), and four
copies of one label+blurb+On/Off switch row. Extract `SettingChoice` and
`SettingSwitch`.

**Line delta:** `HostSettings.tsx` −70, `Lobby.tsx` −25, one new file +50.

Touches neither `Table.tsx` nor the metric. It is the cleanest remaining
duplication in the repo and it is here so it is not forgotten, not because it is
urgent.

---

## Deliberately not in this plan

- **`packages/engine`** — pure, no `Date.now()`, no `Math.random()`, 118 tests
  including seeded full-game simulations. Off limits.
- **`rules.ts` (789) and `rooms.ts` (832)** — over the 500-line line and
  genuinely fine: ~30 and ~40 small functions, largest 67 lines, no duplication,
  comprehensively tested. Splitting them would spread a well-organised subject
  across files and make the reader grep. They fail the primary metric and pass
  every metric that matters.
- **The `rooms.ts` host-setter family** — six functions of near-identical shape
  (`requireHost` → gate → validate → assign → `touch`). A generic helper would
  save ~20 lines and destroy the doc comments explaining *which gate differs
  from its neighbour's and why*, which is the most load-bearing distinction in
  that file. Logged in the findings, recommended against.
- **The five dead exports** (incl. the 81-line `isNoteworthy`) — deletion is a
  behavioural change, not a refactoring. Belongs in the Phase 5 risk pass.
- **Runtime validation of `ClientMessage`** — a real (low-severity) gap, and
  also a behaviour change. Phase 5.

---

## What could go wrong

| Risk | Mitigation |
| --- | --- |
| A pure extraction silently changes an evaluation order or a short-circuit. | Each 3x sub-step is its own commit with its own test written against the extracted unit, and the full 391-test suite runs between each. |
| A layout regression nothing catches, because no test renders a component. | Real and unmitigated by tests. Steps 2 and 5 move markup without editing it, and Step 5 only happens after every decision is out and tested. **This is the residual risk of the Gate 0 choice** and it is worth restating plainly. A visual check of the running app after Step 5 is the honest control. |
| A step turns out bigger than planned. | Stop and re-plan rather than push through (protocol Phase 4). |
| A deploy interrupts a live game. | One PR per phase, one merge, one deploy. |

---

## Gate 3 asks

1. Approve the ordering, or reorder.
2. Step 1 (cycle-breaking) — in or out? It is hygiene, it is broad, and nothing
   later strictly requires it.
3. Step 4 (parameter object) — in or out? The most debatable step.
4. Step 6 (settings controls) — in this PR, or its own later one?
5. Confirm the branch name and issue. Repo convention is issue-first with a
   milestone; this spans one logical piece of work, so I would file **one**
   issue covering the refactor and open one PR against it, with each step as its
   own commit — and merge it as a **merge commit** rather than a squash, so the
   per-step commits survive on `main` and any single step stays revertable.
