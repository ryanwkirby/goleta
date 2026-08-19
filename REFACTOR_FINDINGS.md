# REFACTOR_FINDINGS.md

Phase 0 recon for `goleta`. **Read-only pass — no source file was edited.**

Generated 2026-08-19 against `main` @ `e6a85b4`, clean tree.

---

## 0. The headline, before the tables

Three facts shape everything below, and the third one changes what "reduce the
size of the largest file" is allowed to mean in this repo.

1. **`Table.tsx` is the target.** It is the largest file (1,016 lines), it
   contains the largest function in the codebase by a factor of two (one
   899-line component), and it is the highest-churn file in the history — 48 of
   233 commits touch it, more than one commit in five.
2. **The safety net does not reach it.** 391 tests pass in 1.6 seconds, which is
   an excellent iteration loop, but there is no jsdom, no testing-library, and
   no test that renders a React component. Every one of the 32 `.tsx` files —
   about 6,400 lines — has zero coverage. The pure-logic modules in `lib/` are
   well covered; the screens are not covered at all.
3. **42% of source lines are comments, and they are load-bearing.** `AGENTS.md`
   is explicit that this codebase is full of decisions that read as oversights
   and are not, and the in-file prose is where the reasoning lives. `Table.tsx`
   is 1,016 lines of which **558 are code and 393 are comment.**

Point 3 is the one to hold onto. The protocol's primary metric is largest-file
line count, and in this repo roughly two-fifths of that number is design
rationale that a future agent needs *more* than the code. Any step whose line
delta comes from deleting or thinning comments is a net loss here, however good
it looks in the table. The honest metric for this repo is **largest-file
code-line count**, with comments moved alongside the code they explain.

---

## 1. Size and shape

### Source files over 500 lines

| Lines | Code | Cmt | Cmt% | File |
| ---: | ---: | ---: | ---: | --- |
| 1016 | 558 | 393 | 41% | `packages/web/src/screens/Table.tsx` |
| 937 | 553 | 340 | 38% | `packages/web/src/screens/TableScreen.tsx` |
| 832 | 431 | 326 | 43% | `packages/server/src/rooms.ts` |
| 795 | 558 | 196 | 26% | `packages/web/src/screens/Lobby.tsx` |
| 789 | 457 | 256 | 36% | `packages/engine/src/rules.ts` |
| 676 | 472 | 180 | 28% | `packages/web/src/components/Sunny.tsx` |

### Test files over 500 lines

| Lines | File |
| ---: | --- |
| 871 | `packages/engine/test/sunny.test.ts` |
| 822 | `packages/server/test/integration.test.ts` |
| 724 | `packages/server/test/rooms.test.ts` |

### Functions over 80 lines

Detected by a script and hand-verified. Tests excluded.

| Lines | Location | Notes |
| ---: | --- | --- |
| **899** | `screens/Table.tsx:118` `Table` | One component. ~440 lines of hooks/derivation, then ~460 of JSX with four early returns. |
| **420** | `screens/Lobby.tsx:376` `Lobby` | Drag handlers, seat list, settings, deal gate. |
| **292** | `net/useGoleta.ts:113` `useGoleta` | 8 `useState` + 8 `useRef`; the socket lifecycle is one 180-line `useEffect`. |
| **272** | `components/PeekStrip.tsx:79` `PeekStrip` | |
| **266** | `components/Hand.tsx:66` `Hand` | |
| **264** | `screens/HandView.tsx:105` `HandView` | Takes **30 props**. |
| **248** | `screens/TableScreen.tsx:457` `Playing` | |
| **190** | `motion/plan.ts:161` `planFlights` | One `switch` over `GameEvent` with a `add({…})` block per arm. |
| **181** | `screens/TableScreen.tsx:80` `TableScreen` | |
| **173** | `motion/TableMotion.tsx:99` `TableMotion` | |
| **169** | `screens/Join.tsx:10` `Join` | |
| **167** | `components/Seats.tsx:174` `Seats` | |
| 140 | `App.tsx:32` `App` | |
| 120 | `components/Piles.tsx:42` `Piles` | |
| 111 | `components/RoomInvite.tsx:62` `RoomInvite` | |
| 102 | `screens/TableScreen.tsx:717` `EdgeNames` | |
| 97 | `components/Sunny.tsx:362` `SunnyCaught` | |
| 95 | `components/Seats.tsx:78` `Seat` | |
| 90 | `components/Sunny.tsx:520` `SunnyAccusePicker` | |
| 89 | `components/TableInstall.tsx:71` `TableInstall` | |
| 87 | `components/HostSettings.tsx:360` `HostSettingsCog` | |
| 86 | `components/Sunny.tsx:183` `SunnyPeel` | |
| 81 | `lib/format.ts:83` `isNoteworthy` | **Dead — see §5.** |

No classes anywhere in `src` except `RoomError` (12 lines). This is a
functions-and-modules codebase; "Extract Class" in Fowler's sense will mostly
mean "Extract Module" or "Extract Hook" here.

### Modules over 400 lines

`Table.tsx`, `TableScreen.tsx`, `rooms.ts`, `Lobby.tsx`, `rules.ts`,
`Sunny.tsx`, `socket.ts` (486), `HostSettings.tsx` (447), `plan.ts` (443),
`useGoleta.ts` (405).

`rules.ts` and `rooms.ts` deserve a note: they are long but **already well
decomposed** — ~30 and ~40 top-level functions respectively, the largest being
67 lines (`handleDraw`). Their length is subject-matter breadth plus doc
comments, not tangle. They are poor refactor targets.

### Package totals

| Package | src | test |
| --- | ---: | ---: |
| `engine` | 1,969 | 2,306 |
| `server` | 1,545 | 1,607 |
| `web` | 11,460 | 2,151 |

94 TS/TSX files. Total src: 7,894 code + 5,693 comment + 1,074 blank.

### Dependency graph (directory level)

```
engine/src        →  (nothing)
server/src        →  engine/src
web/src           →  web/{components,net,screens}
web/src/components→  engine/src, web/{lib,motion,net}
web/src/lib       →  engine/src, web/{components,motion,net}
web/src/motion    →  engine/src, web/{components,net}
web/src/net       →  engine/src, web/lib
web/src/screens   →  engine/src, web/{components,lib,motion,net}
```

**Three directory-level cycles. No file-level cycles.** The graph is a DAG at
file granularity; the cycles are purely an artefact of where four things were
parked.

| Cycle | Caused by |
| --- | --- |
| `components` ↔ `lib` | `lib/format.ts` and `lib/pileBox.ts` import `SUIT_GLYPH`, `SUIT_LABEL`, `CARD_WIDTH_PX`, `CARD_HEIGHT_PX`, `CardSize` from `components/Card.tsx` |
| `components` ↔ `motion` | `motion/plan.ts` and `motion/TableMotion.tsx` import `CardSize` / card components from `components/Card.tsx`; four components import `useMotion`/anchors back |
| `lib` ↔ `net` | `lib/judgedCall.ts` and `lib/reshuffle.ts` import `type LoggedEvent` from `net/useGoleta.ts`; `net/identity.ts` imports `type HandSort` from `lib/sort.ts` |

All three have the same root cause and the same cheap fix: **three pure things
are living inside impure modules.** Card geometry (`CARD_*_PX`, `CardSize`,
suit glyphs) is in a React component file; animation timings (`PEEL_MS`,
`RESHUFFLE_MS`) are in the flight planner; `LoggedEvent` is in the socket hook.
Moving those to `lib/` breaks every cycle and touches ~10 import lines.

---

## 2. Duplication

### Exact repeated blocks

I ran a normalised sliding-window scan (comments, blanks and bare-delimiter
lines stripped).

- **5+ lines appearing 3+ times, across all of `web/src`: 6 windows**, and all
  six are trivial — a `setCopied`/`setTimeout` clipboard tail, an `<svg>`
  attribute preamble, a multi-line React import, and the same
  `<SunnyExplainer>` block written three times inside `Table.tsx`.
- **`server/src` and `engine/src`: zero.** (The server's *tests* have a 6×
  repeat — see below.)

**This codebase does not have a copy-paste problem.** That is worth stating
plainly, because the protocol's ordering assumes duplication-first and the
usual generated-code defect profile is not what is here.

### Near-identical functions (the real finding)

These differ only in a literal or a field name, which is exactly the class the
protocol calls out.

**A. Segmented two-button chooser — 3 near-identical implementations**

| Function | File |
| --- | --- |
| `BotSpeedPicker` | `screens/Lobby.tsx:248` |
| `DealerPicker` | `components/HostSettings.tsx:123` |
| `IrlToggle` | `components/HostSettings.tsx:292` |

`BotSpeedPicker` and `DealerPicker` are line-for-line identical apart from the
constant array (`SPEEDS` / `DEALERS`), the heading string and a wrapper class.
Same `find(o => o.key === x)`, same `.map` to `<Button variant={… ? "primary" :
"secondary"} className="flex-1" aria-pressed={…}>`, same `{chosen?.blurb}`
footer. `IrlToggle` is the same shape with the blurb dropped and the key
compared against a boolean.

**B. Label + blurb + On/Off switch row — 4 sites, 2 implementations**

`ShuffleSeatsToggle` (`HostSettings.tsx:89`) and the three rows inside
`HouseRulesPicker`'s `.map` (`HostSettings.tsx:216`) render byte-identical
markup: `min-w-0 flex-1` text column, then
`<Button variant={on?…} className="min-w-16 px-3 py-1.5 text-xs" role="switch"
aria-checked={on} aria-label={…}>{on ? "On" : "Off"}</Button>`.

Together A and B are one `SettingChoice` + one `SettingSwitch` and ~120 lines
of `HostSettings.tsx` / `Lobby.tsx`.

**C. The two table layouts**

`Table.tsx` (upright) and `HandView.tsx` (landscape) are separate layouts by
design and must stay separate — but they render the same five pieces from the
same state, with the markup diverging only in placement:

| Piece | `Table.tsx` | `HandView.tsx` |
| --- | --- | --- |
| Hand frame (turn ring + `MoveRefusal` + `Hand`) | 942–967 | 306–325 |
| Sunny call offer (`SunnyCall` in a pinned wrapper) | 897–906 | 209–220 |
| `SunnyAccusePicker` dock | 863–871 | 236–247 |
| `SuitPicker` dock, `dealing`-gated | 106–113, 873–880 | 249–259 |
| `HandSortButton` + `HelpLink` cluster | 909–923 | 344–366 |

The `sunnyTarget` wrapper comments in the two files are near-identical prose
arguing the same point twice.

**C2. Walking the table to the next live seat — found by the benchmark, not by me**

`lib/facing.ts:44` `seatToFace` walks forward from `game.waitingOn`, skipping
eliminated players (and bots), wrapping at the end. The baseline benchmark agent
needed exactly that walk for an unrelated feature, found this one, and could not
reuse it — it iterates `room.seats` rather than `game.players`, includes the
starting seat, and filters bots. It duplicated the shape instead.

This is a **latent** near-duplicate: only one implementation exists today, but
the shape is demanded by more than one caller and the existing one is welded to
its single use. Worth generalising the *next time* a second caller appears
rather than pre-emptively — noted so the next person does not rediscover it.

**D. `rooms.ts` host-setter family — 6 functions, one shape**

`setBotSpeed`, `setIrl`, `setDealerMode`, `setShuffleSeats`, `setHouseRules`,
`addBot` all run `requireHost` → optional `roomStatus === "playing"` gate →
per-field validation → assign → `touch(room)`. Counts: `requireHost` 9×,
`touch(room)` 14×, `"Wait for this game to finish"` 4×.

**I do not recommend collapsing D.** Each function carries a substantial doc
comment explaining precisely *why its gate differs from its neighbour's* —
which is frozen mid-game and which is not is the single most load-bearing
distinction in that file. A generic `hostSetting(room, by, validate, apply)`
would save ~20 lines and destroy the thing that makes the file readable.
Logged for completeness, recommended against.

### Head/tail boilerplate

| Pattern | Count | File |
| ---: | ---: | --- |
| `try { localStorage… } catch { fallback }` | **17** | `net/identity.ts` (260 lines; the whole file is this shape) |
| `return broadcast(room);` as a handler tail | 9 | `server/src/socket.ts` |
| `touch(room);` as a mutator tail | 14 | `server/src/rooms.ts` |
| `send({ t: "intent", intent: { type: …, playerId: me } })` | 7 | `Table.tsx`, `HandView.tsx`, `TableScreen.tsx` |
| Full server + host + guest + `until` setup | 6 | `server/test/integration.test.ts` |

`identity.ts` is the cleanest Extract-Function target in the repo. It already
has `readJson<T>` doing exactly this for one case; a `readLocal`/`writeLocal`
pair would fold 17 blocks into three helpers without touching a single comment
— roughly 135 code lines down to 85, and 260 total lines down to about 205
(all 96 comment lines stay).

---

## 3. Safety net status

**Command:** `npm test` (root) → `vitest run`, include
`packages/*/test/**/*.test.ts`.

**State: green, fast, not flaky.**

```
Test Files  24 passed (24)
     Tests  391 passed (391)
  Duration  1.61s
```

`npm run lint` (oxlint) — clean, exit 0.
`npm run typecheck` (`tsc` × 2 projects) — clean.

**Coverage: not measurable.** `@vitest/coverage-v8` is not installed. The
figures below are from mapping every test file's imports onto `src`.

**Covered** — `engine/src` (rules, sunny, houseRules, bot, redact, plus full
seeded game simulation); `server/src/rooms.ts`, `socket.ts` and `persist.ts`
(via a real-WebSocket integration suite); and these `web` modules: `lib/fan`,
`lib/handFan`, `lib/fitScale`, `lib/tableEdges`, `lib/pileBox`, `lib/facing`,
`lib/format`, `lib/pile`, `lib/seatDrag`, `lib/seating`, `lib/sort`, `lib/qr`,
`motion/plan`, `motion/anchors`, `net/route`, `net/identity` (partial).

**Zero coverage** — every `.tsx` file (32 files, ~6,400 lines), including all
four screens and every component. Plus `net/useGoleta.ts` (405),
`motion/TableMotion.tsx` (385), `lib/judgedCall.ts`, `lib/reshuffle.ts`,
`lib/measure.ts`, `lib/viewport.ts`, `lib/wakeLock.ts`, `lib/fullscreen.ts`,
`lib/sharedScreens.ts`.

**No DOM test infrastructure exists.** No `jsdom`, no `happy-dom`, no
`@testing-library/*`. `vitest.config.ts` sets `environment: "node"` globally.

**CI** (`.github/workflows/ci.yml`) runs on every `pull_request` and every push
to `main`, and gates on: lint → typecheck → test → `npm run build` → `docker
build`. Deploy (`deploy.yml`) is a separate workflow, push-to-`main` and
manual-dispatch only, on the self-hosted Mac mini runner.

### What this means for Phase 1

Characterization tests for `Table.tsx` cannot be written with the tooling that
is here. There are two routes, and they are not equal:

- **Add jsdom + `@testing-library/react`** and pin the component boundary.
  Honest coverage of the target, but it adds two dev dependencies, drags the
  suite off `environment: "node"`, and slows the 1.6-second loop that is
  currently this repo's best asset.
- **Follow the seam the repo already has.** `lib/judgedCall.ts`,
  `lib/reshuffle.ts`, `lib/handFan.ts`, `lib/seating.ts`, `lib/facing.ts` are
  all pure logic lifted out of screens and tested in `node`. That convention
  already exists and already works. Extracting `Table.tsx`'s derivation layer
  into `lib/` *creates* the testable boundary rather than mocking around it —
  the characterization tests get written against the extracted units as each
  step lands.

The second is what this codebase is already doing and I would recommend it, but
it inverts the protocol's Phase 1 ordering (tests strictly before structure).
**That is a gate decision, not mine to take** — see §7.

---

## 4. Risk surface

*Flagged only. Nothing fixed, nothing changed.*

### Secrets — clean

No hardcoded keys, tokens, connection strings or private keys anywhere in
`packages/*/src`. The only `token` in the tree is the per-seat rejoin secret,
generated at runtime in `ids.ts` and never logged. All configuration comes from
`process.env` with defaults (`server/src/config.ts`). `.env` and `data/` are
gitignored. There are no accounts and no login by design (`AGENTS.md`), so
there is no credential store to leak.

### Authentication and authorization

There is no authentication — deliberately, and documented. Identity is a
`playerId` plus a rejoin token in `localStorage`. What matters is that the
authorization that *does* exist is consistent.

**Permission checks, all in `server/src`:**

| Check | Where | Guards |
| --- | --- | --- |
| `requireHost` | `rooms.ts:320` | `addBot`, `setBotSpeed`, `setDealerMode`, `setShuffleSeats`, `setHouseRules`, `moveSeat`, `removeSeat`, `beginGame` (9 call sites) |
| `seat.token !== token` | `rooms.ts:291` | `rejoinRoom` — the only secret comparison in the app |
| `seatOf(room, playerId)` | `rooms.ts:614` | `applySeatIntent` refuses an intent from a non-seat |
| `if (!playerId) throw` | `socket.ts:325` | every message below `watch` requires a seat |
| `redact.ts` | engine | the security boundary: `state.challenge`, `state.sunny`, the deck |

**The seat id is stamped server-side** — `applySeatIntent` does
`applyIntent(game, { ...intent, playerId })`, overwriting whatever the client
sent. A client cannot act as another player. This is correct and it is the
single most important line in the server.

**One deliberate widening**, and it is documented in both `AGENTS.md` and
`docs/PROTOCOL.md`: `socket.ts:310–324` lets a watcher that self-identified as
a table screen submit `drawCard` on behalf of the seat on the clock. It is
gated on five conditions (`!playerId`, `client.table`, `intent.type ===
"drawCard"`, `room.irl`, `phase.kind === "action"`) plus a bot check. The
`table` bit is client-asserted, so the honest reading is *in an IRL room, any
watcher may draw for the seat on the clock*. That is the stated design.
**Not a finding — recorded so a future reader does not "fix" it.**

**Data-access paths that check nothing:** none found. Every mutator in
`rooms.ts` is reached only through `socket.ts`'s `handle`, which requires a
seat first.

### Input validation

`socket.ts:411` does `JSON.parse(String(raw)) as ClientMessage` — a cast, not a
parse. There is no runtime schema validation anywhere. Most fields are then
checked by hand, but not all:

| Message | Field | Validated? |
| --- | --- | --- |
| `create` / `join` | `name` | `cleanName` strips control chars and clamps to `NAME_LIMIT` — **but assumes a string.** `{t:"create",name:123}` throws `TypeError` inside `.replace`. |
| `join` / `watch` / `rejoin` | `code` | `normaliseCode(code)` — same assumption |
| `rejoin` | `playerId`, `token` | compared, not type-checked |
| `intent` | `intent` | **forwarded to the engine as an unvalidated object** |
| `removeSeat` / `moveSeat` | `playerId` | not type-checked (looked up, so a non-string simply misses) |
| `moveSeat` | `direction` | ✅ explicit |
| `setBotSpeed` | `speed` | ✅ explicit |
| `setIrl` / `setHints` | `on` | ✅ `typeof … !== "boolean"` |
| `setShuffleSeats` / `composingCall` | `on` / `open` | ✅ `=== true` |
| `setHouseRules` | all three | ✅ each against permitted values |
| `setDealerMode` | `mode` | ✅ explicit |

**Severity is low but not zero.** Everything above lands inside the `try` at
`socket.ts:415`, which returns a generic error to that one client and
`console.error`s the rest. No crash, no cross-client effect, no state
corruption. But the malformed-type paths take the *unknown-error* branch, which
means a client can fill the server log at will.

`route()` in `rules.ts:188` is an exhaustive `switch` over `Intent["type"]`
with no `default`. At runtime an unknown `type` falls through and returns
`undefined`, which `applyIntent` treats as `!== null` → refusal, and `socket.ts`
renders via `outcome.error ?? "That move isn't allowed"`. Correct by accident
through two layers of coincidence. Worth an explicit `default`.

**Good guards already present:** `maxPayload: 16 * 1024` on the
`WebSocketServer`; `HouseRules` on the wire deliberately excludes `deckCount`
and `startingHandSize` so a client cannot request a 900-card hand;
`MAX_TABLE_PLAYERS` enforced on join; `pruneRooms` sweeps idle rooms every 15
minutes; a 2-second shout cooldown per client.

**Gap:** no rate limit on anything except `help`. A client can send `create` in
a loop and grow the room store until the 6-hour idle sweep catches up.

### Dependencies

All ten runtime dependencies exist upstream, are current, are maintained, and
are imported. No hallucinated packages. No unused packages. No known-vulnerable
pins. `npm ls` resolves cleanly.

Runtime: `fastify` 5.11, `@fastify/static` 10.1, `ws` 8.21, `react` /
`react-dom` 19.2, `uqr` 0.1.3. Tooling: `vite` 8.2, `tailwindcss` 4.3,
`oxlint` 1.71, `vitest` 3.2, `typescript` ~6.0.

`uqr` (0.1.3, QR generation) is the only small/low-traffic one. It is used in
exactly one place (`lib/qr.ts`, 53 lines) behind a tested wrapper, so the blast
radius is one function.

### Error-masking constructs

24 bare `catch {}` blocks. **Almost all are justified**, and I would leave them:

- **17 in `net/identity.ts`** — every `localStorage` access. Private browsing
  and a full quota both throw, and the correct behaviour genuinely is "you just
  don't get to reclaim your seat". Each has a comment saying so. The *code* is
  redundant (§2), the *swallowing* is right.
- **4 clipboard `catch`es** (`Lobby.tsx:44`, `QrCode.tsx:82`,
  `RoomInvite.tsx:96`, and `TableInstall.tsx:76`) — permission denied, fall back
  to showing the text.
- **`wakeLock.ts:56`** — `AGENTS.md` explicitly requires silence: battery
  saver, old browsers and insecure origins all just mean no lock.
- **`socket.ts:416`** — the only one that matters, and it does the right thing:
  distinguishes `RoomError` from unknown, logs the unknown, returns a generic
  message.

No `unwrap()`-equivalents: **zero non-null assertions** and **zero `as any`**
in the entire `src` tree. No `@ts-ignore`, no lint suppressions. No retry loops
that could hide a failure.

The one genuine masking risk is the `route()` implicit `undefined` above.

---

## 5. Dead code

Five exported symbols with **no reference anywhere in the repo**, tests
included:

| Symbol | File | Lines |
| --- | --- | ---: |
| `isNoteworthy` | `web/src/lib/format.ts:83` | **81** |
| `Reshuffled` (type) | `web/src/lib/reshuffle.ts:37` | 1 |
| `cardLabel` | `engine/src/cards.ts:41` | 1 |
| `SUIT_NAMES` | `engine/src/cards.ts:43` | 5 |
| `SuitKey` (type alias) | `engine/src/protocol.ts:273` | 1 |

`isNoteworthy` is an 81-line exported predicate — with its own doc comment
explaining an event-filtering policy — that nothing calls. It is 10% of
`format.ts`. Deleting it is free, and it should be verified against the git
history first in case it is a half-landed feature.

No orphaned files. No commented-out code blocks (one false positive in
`rules.ts:444`, which is prose). **No `TODO`, `FIXME`, `HACK` or `XXX` anywhere
in `src` or `docs`** — unusual, and a real signal about how this repo is kept.

---

## 6. Verdict

**This is a refactor, not a rewrite, and the domain model is not the problem —
the model is the best part of the codebase.**

`packages/engine` is pure, has no `Date.now()` or `Math.random()`, records all
randomness in a replayable event stream, and is covered by 118 tests including
seeded full-game simulations that assert card conservation, forced-play and
single-winner invariants across every house-rule combination. `redact.ts` is a
real, tested security boundary. `packages/server` is a thin authoritative
referee over it, with the seat id stamped server-side so a client cannot
impersonate. There is no duplication worth naming in either, no secrets, no
`any`, no dead dependencies, and CI gates lint, types, tests, bundle and image
on every push. Nothing here needs rewriting and very little needs restructuring.

The problem is confined to `packages/web`, and within it to one file. `Table.tsx`
is a 899-line component holding 8 pieces of `useState`, 6 `useEffect`/
`useLayoutEffect` hooks, ~20 derived values, 4 early-return layout branches, and
then both the upright table markup *and* the 30-prop call into the landscape
one. It is the largest file, contains the largest function by a factor of two,
and absorbs one commit in five. It is also **completely untested**, and that is
the finding that should drive the plan: the reason every change to it is
expensive is not that it is long, it is that it is long *and* nothing catches a
mistake in it.

The good news is that the seam is already cut. This repo has an established,
working convention — pure derivation lives in `lib/` as small tested modules
(`judgedCall.ts`, `reshuffle.ts`, `handFan.ts`, `seating.ts`, `facing.ts`), and
screens are thin over it. `Table.tsx` simply has ~440 lines of derivation that
never made the trip. The highest-value refactoring here is not Extract Function
and it is not splitting the file; it is **Extract Class (7.5), realised as a
`useTableState` hook plus pure `lib/` modules**, which pulls the state machine,
the Sunny composition flow, the graduation bookkeeping and the layout-choice
predicates out into units the existing `node` test runner can characterize
without a single new dependency. Splitting the JSX comes after that and only
along the seams it exposes — the shared `Table`/`HandView` pieces in §2C are the
obvious ones.

Two warnings for whoever writes the plan.

**Do not chase the line-count metric through the comments.** 42% of this source
is design rationale, `AGENTS.md` is 62KB of "these read as bugs and are not",
and the prose is the mechanism that keeps a fresh agent from `fix`ing the Sunny
Rule out of existence. Every extraction must carry its comment block with it.
Measured properly, `Table.tsx` is a 558-line component, and the target should be
stated in code lines.

**Do not touch `rules.ts` or `rooms.ts` for size.** They are over 500 lines and
they are fine: ~30 and ~40 small functions, largest 67 lines, no duplication,
comprehensively tested. Splitting them would spread a well-organised subject
across files and make the reader grep. They fail the primary metric and pass
every metric that matters.

If a smaller warm-up target is wanted before `Table.tsx` — and the protocol
recommends exactly that, "build the process before spending it on the hard
case" — `net/identity.ts` is the right one. Clear boundary, no hidden logic,
already has a partial test file, 17 instances of one boilerplate shape, and a
~37% cut in code lines available from a single named refactoring.

---

## 7. Open questions for the gate

1. **Which module?** My recommendation: `net/identity.ts` as the process
   warm-up, then `screens/Table.tsx` as the real target.
2. **Phase 1 ordering.** Characterization tests for `Table.tsx` need either
   (a) jsdom + `@testing-library/react` added as dev deps, or (b) the repo's
   existing extract-to-`lib/`-and-test convention, which means tests land
   *with* each extraction rather than strictly before it. (b) matches the
   codebase and preserves the 1.6s loop; (a) matches the protocol as written.
   **This needs your call.**
3. **Phase 2 benchmark.** Worth running? It costs a subagent per step. If yes,
   the representative change should be `Table.tsx`-shaped so the metric moves.
4. **Repo workflow.** `AGENTS.md` requires issue → branch → commits → PR →
   squash-merge for every code change, and merging to `main` triggers a live
   deploy to the Mac mini. Refactor steps are "one step, one commit" under this
   protocol. Confirm: one PR per step, or one PR per phase with granular commits
   on the branch?
5. `REFACTOR.md` currently lives in `~/.claude/uploads/`, not the repo root, and
   its **Standing conventions** section is unfilled. Proposed fill below —
   should I commit `REFACTOR.md` with it?

### Proposed `Standing conventions for this repo`

```
- Language / runtime: TypeScript ~6.0 on Node >=24. ESM throughout
  ("type": "module"). npm workspaces monorepo, one Docker image, one process.
- Test command (scoped): npx vitest run packages/web/test   (full: npm test — 391
  tests, ~1.6s, keep it that way)
- Lint / format / typecheck: npm run lint (oxlint) · npm run typecheck
  (tsc × 2 projects). No formatter is configured; match surrounding style.
- Public interfaces that must not change:
    · packages/engine/src/protocol.ts — the wire contract (ClientMessage,
      ServerMessage, RoomView, GameView, HouseRules). Both sides depend on it.
    · packages/engine/src/index.ts — the engine's public surface.
    · packages/engine/src/redact.ts — the security boundary. Any new field on
      game state must be considered here and defaults to NOT being sent.
    · Room snapshot shape (persist.ts). Changing it means bumping
      SNAPSHOT_VERSION; never write a migration.
- Directories that are off limits:
    · packages/engine/src — pure rules. No I/O, no Date.now(), no Math.random().
      Do not restructure for size; it is well decomposed and heavily tested.
    · docs/RULES.md — canonical. Code follows it, not the other way round.
    · Anything touching the deploy while a run is in flight (see AGENTS.md).
- Known-broken behavior that is load-bearing and must be preserved:
    → AGENTS.md § "Rules that look like bugs and are not" is the authority, in
      full. It is 62KB and every bullet has an issue number. The short list of
      things a refactor is most likely to break by accident:
        · The draw pile stays tappable when you hold a legal play. No warning,
          no disabled state, no hint. This is the entire Sunny Rule.
        · The app never highlights other players' legal cards, and highlights
          your own only under the hints preference / forced play / one bought
          turn.
        · Whether a draw was illegal never leaves the server. No field, no glow,
          no ordering, no wording.
        · Comments are load-bearing. 42% of src is design rationale carrying
          issue numbers. An extraction moves the comment with the code; nothing
          deletes rationale to hit a line target.
```
