# AGENTS.md — how AI coding agents work in this repo

This is the shared operating guide for **any AI coding agent** working in this
repository — Claude Code, Gemini CLI, Codex, and so on. `CLAUDE.md` and
`GEMINI.md` are symlinks to this file, so every tool loads the same instructions
from its own conventional filename. Keep this file as the single source of truth.

## Development workflow

Follow this process for **every firm ask to change the code.** (Open questions
and design trade-offs can be discussed first; once the ask is firm, follow this.)

1. **Issue(s) first.** Create a GitHub issue for the ask if one doesn't already
   exist, or update the existing issue if it needs it. One ask may span several
   issues — file/update each. Attach issues to the right milestone (M1, M2).
2. **Branch** off `main` (never commit changes straight to `main`).
3. **Multiple commits** — at least one per issue, and more than one per issue
   for a larger change. Keep them logically separated; use common sense.
4. **Open a PR.**
5. **Iterate.** If the repo runs CI, push fixes until it's green before merging.
6. **Merge decision.** By default, when you're confident the ask is addressed,
   merge without asking. Pause for review after opening the PR only when there
   are genuine uncertainties, larger unknowns or assumptions worth a look, or
   the change is risky.
   - **Squash-merge** a single-issue / single-logical-change PR (`gh pr merge
     --squash`) so `main` stays a clean linear history with one revertible
     commit per change.
   - **Merge commit** (`gh pr merge --merge`) a genuinely multi-part or
     multi-issue PR, so its per-issue commits are preserved on `main`.
   Either way the granular commits still live on the branch for review.
7. **After `main` is updated:** delete the branch (local **and** remote), clean
   up any scaffolding/temp files created along the way, handle the deploy (see
   below), then report done.

End commit messages with a `Co-Authored-By` trailer and PR bodies with a
generation note identifying the agent.

## Deploy

This repo has **no auto-deploy runner**. After merging, if a running instance
needs the change, deploy to Docker manually from the repo root with `docker
compose up -d --build`. (Docs-only changes need no deploy.)

Public at **https://goleta.ryankirby.net**, port 8063 on the Mac mini, through
the shared `cloudflared-tunnel` container. See `docs/DEPLOYMENT.md`.

**A redeploy may drop games in progress.** Live rooms are snapshotted to disk on
a named volume and restored on boot, which makes a reload or a routine restart
painless — but that is a convenience, not a guarantee worth building around. If
you change the persisted shape, bump `SNAPSHOT_VERSION` and let the old
snapshots be discarded on boot. Don't write migrations for them.

## Game rules

`docs/RULES.md` is canonical. The engine implements it; the UI explains it. If a
rule question comes up, answer it there first, then in code — and if the code and
`docs/RULES.md` ever disagree, that's a bug in whichever one is newer.

The game is **reversed** Crazy 8s: cards are an asset, you are eliminated when
your hand empties, and the last player still holding cards wins. Playing is
compulsory; drawing is the reward. Almost every intuition carried over from
normal card games is inverted, so read `docs/RULES.md` before touching
`packages/engine`.

## Rules that look like bugs and are not

These are load-bearing. Each one will read as an oversight to a fresh pair of
eyes; all of them have already been decided deliberately. Do not "fix" them.

- **The draw pile stays tappable when you have a legal play, with no warning.**
  Drawing when you could have played is the violation the entire Sunny Rule
  exists to punish. The UI must permit it silently. No disabled state, no
  confirmation dialog, no "are you sure?", no hint.
- **The app never highlights other players' legal cards.** Every hand is face
  up, so you can see them; working out whether they had a play is your job.
  Adding that highlight would make Sunny calls trivially automatic.
- **The seat fan stops tightening while the strip still overflows.** Hands
  overlap so the table fits, but never past the floor in `lib/fan.ts` — the
  narrowest sliver that still shows a rank and its suit. Squeezing further would
  fit more seats on a phone and quietly break the rule above: a hand you can't
  read is a play you can't spot. Rows are the release valve, not a tighter
  sliver, and the scrolling left between seats is the accepted cost (#59).
- **The app does not tell you which of your own cards are playable either**, and
  the turn prompt won't say whether you have a play. That guardrail is offered
  on the rules screen on the way in, lasts until you finish your first game if
  you took it, and then comes off for good — after which you can ask for it
  back, one turn at a time, and everyone at the table hears you ask (#33).
  Restoring the highlights unconditionally removes the chance to make the
  mistake the Sunny Rule feeds on.
- **Whether a draw was illegal never leaves the server.** No field carries it,
  and nothing on screen — no glow, no ramp, no ordering, no wording — separates
  a legal draw from an illegal one. The sun has exactly one appearance and it
  means "somebody reached, and you may accuse them."

  This bullet has been round the houses, so the history is worth keeping. #31
  reversed the rule and shipped the answer as `GameView.sunnyWouldLand`, behind
  a ten-second glow ramp, on the reasoning that a wrong call cost the caller a
  card and free guessing needed a brake somewhere. #50 reversed it back, because
  requiring the caller to **name the card** is a far better brake: a guess now
  has to be a specific claim, made out loud, that can be specifically wrong. The
  tell had nothing left to buy. Both the flag and the ramp are gone; do not
  reintroduce either, under any name.
- **What does go out is `sunnyReach` — evidence, not a verdict.** A viewer who
  could call is sent the offender's hand and the board as they stood before the
  reach, because an accusation has to name one of those cards. Nothing says
  which of them was legal. Do not add a `legalCardIds` equivalent for it, do not
  sort it helpfully, and do not dim the cards that wouldn't have played.
- **A judged call shows its working, and shows the same working either way.**
  `sunnyCalled` carries `evidence`: the card that was in play at the reach, the
  suit that had to be matched then, and whatever has landed on the pile since.
  The table watches the pile peel back to that moment, with the card in play and
  the card the caller named both marked, before the ruling is announced (#63).

  Three things about it are load-bearing. It goes to **everyone**, offender and
  spectators included — the verdict is already public in `sunnyCalled.correct`,
  so the material it was reached on gives nothing else away. A **wrong** call
  peels identically to a right one; the difference the table reads is whether
  the two marked cards match, and a peel that only ran for correct calls would
  be the tell #50 removed, wearing a hat. And **only those two cards are
  marked** — never the card they should have named, which would answer the
  question the ruling deliberately leaves open and make the next call automatic.

  It is derived on the way out and never held on the state. `Challenge` carries
  `reachPile` — the pile frozen at the same instant as `reach`, and by the same
  rule — because the offender may play on top of the card they reached against
  before anybody calls, and a wrong call usually has no `violation.snapshot` to
  read anything out of. The snapshot itself still never leaves the server.
- **Bots never wait for a Sunny window.** Their pacing is turn rhythm and
  nothing else, and `botPace` has no input that could tell it a call is on
  offer. A window opens on every draw, so a bot that held off would be stalling
  the table almost continuously — and a bot pausing after its own draw so the
  seat next to it might accuse it is the worst of it. Don't reintroduce a grace
  period. (#56)
- **They do wait for somebody who has actually opened the picker**, which is a
  different thing and is not #56 coming back. That grace was bots idling on the
  *possibility* of a call, on every draw, all game. This hangs off an action a
  person took: tapping the sun sends `composingCall`, and the bots stop until
  they submit, cancel, the window shuts, or `CALL_HOLD_MS` runs out. Without it
  the three decisions #50 moved onto the player — spot the reach, read the hand
  they reached from, name a card — have to fit inside a beat paced for one tap,
  and they don't. `DEFAULT_BOT_TIMING` is untouched by any of it: the fix is
  stopping the clock, not stretching every figure at the table to fit the
  slowest possible call. (#73)
- **A hold is never broadcast, and it can't be leaned on.** That somebody is
  weighing a call is not something the table gets told — it would be a tell
  about a verdict nothing else here gives away. Bots going quiet is visible, and
  that is accepted: it says somebody is thinking, not that they are right. Only
  a viewer who could really call may hold, and the deadline is set once per
  window, so reopening the picker is not a stall button.
- **The drawer is never told they've been caught**, and neither is a spectator.
  `sunnyReach` is gated on being able to call. The whole `state.challenge`
  object, snapshot and `violation` and all, never leaves the server. That gate
  is about a *live* window: once a call has been judged, `sunnyCalled.evidence`
  goes to the whole table, because by then there is nothing left to give away.
- **A wrong call costs no cards.** It locks the caller out for three draws
  (`SUNNY_LOCKOUT_DRAWS`) and that is all. The old card forfeit was a
  digital-era invention to stop free guessing; the game's original written rules
  never had any wrong-call penalty, and naming the card does that job now. The
  lockout is visible only to the player serving it.
- **A refused move is answered against the hand, and every other notice at the
  top of the screen.** That looks like an inconsistency and is the point. The
  top belongs to the Sunny announcement, which is the one thing at this table
  nobody may miss, and a refusal is perfectly reachable while one is up — a pill
  landing on the ruling would cover the more important news with the less. And a
  refusal answers a tap that just happened, so it belongs against the cards that
  didn't move, not pinned to the furniture. It hangs off the top edge of the
  hand in **both** layouts, off the same `relative` box `HelpShout` uses, so
  turning the phone never moves where the answer appears (#99). The engine's
  refusals are written as three-word fragments to fit it — do not lengthen them
  back into sentences (#90).
- **Both refusals are drawn on a neutral near-black surface, not a red one**,
  with a rose ⊘ doing the semantic work (#100). Flooding the panel with red is
  the obvious thing and it is wrong twice here: red on this green is
  complementary-colour vibration, and red already means *hearts and diamonds* on
  a screen full of cards. The sign is also what keeps the meaning legible
  without relying on colour at all. Both weights share `SURFACE` in
  `Refusal.tsx`; they differ in shape, life and whether there is anything to
  dismiss, and in nothing else.

## House rules

A table can vary three things, all of them rules the game already had written
down: the two alternates from the original rules (**Power of Eights**,
**Dealer's Choice**) and whether the **Sunny Rule** is played at all. They live
on `GameOptions`, are chosen by the host in the lobby, and apply at the next
deal.

Two constraints on anything added here:

- **Options are data, never behaviour.** `applyIntent` clones the state on
  every intent, `Challenge.violation.snapshot` clones it again, and `persist.ts`
  puts it through `JSON.stringify`. A function on `GameOptions` throws
  `DataCloneError` on the first move. Behaviour that varies is looked up from
  these values in module scope, which is also what keeps `applyIntent(state,
  intent)`'s signature stable.
- **`DEFAULT_OPTIONS` is the game as written**, and every alternate defaults
  off. A table that never opens the lobby controls plays exactly the game it
  played before, and the existing tests are the check on that.

What a *client* may set is narrower still: `HouseRules` in the protocol carries
the three toggles and nothing else. `deckCount` and `startingHandSize` are not
on offer over the wire — they arrive from a browser, and a hand size of nine
hundred is a denial of service, not a house rule.

The safety net is `simulation.test.ts`, which plays every combination out in
full. Its three invariants — card conservation, forced play never skipped,
exactly one winner — say nothing about which rules are in play, so they hold a
variant to the same standard as the default game. Add a rule, add it to the
matrix.

## IRL mode

`RoomView.irl` says a table is sitting in the same room, each holding their own
phone. It is **presentation, never rules**: the host sets it, `packages/engine`
never learns it exists, and it is deliberately not on `GameOptions` or
`HouseRules`. It is also the one host setting not frozen mid-game, because
nothing it touches is running — see `docs/PROTOCOL.md`.

**Seat order is turn order, and the arrows for changing it are IRL-only.** The
order is real in every room; it is only a table sitting in one that has a
physical order for it to disagree with, and a game that deals across the table
and back gets noticed three turns in, when it's too late to fix. So the lobby
numbers the seats and gives the host up and down arrows, and the first deal into
an IRL room asks *"Does the seat order look correct?"* once. `moveSeat` on the
wire is deliberately **not** gated on `irl`: which rooms are worth offering
arrows in is a presentation call, and refusing the message would throw an error
at a host who flipped an unrelated setting mid-shuffle. Moving off either end
does nothing rather than refusing, for the same reason.

A table has **two views, one brain**. `Table.tsx` holds all the state — the
Sunny state machine, the stall timer, the assist, the sort — and picks a layout
at the bottom. `HandView` is the landscape one: your hand at `xl`, and a peek
strip carrying the table centre. Anything that needs table state belongs on
`Table`; the layouts are given what to draw.

**Which way up the phone is picks between them, and nothing else does.**
Sideways is your hand, upright is the whole table. There is no stored
preference and no control to tap — the pair of `⇄` links that used to swap them
are gone, along with `goleta:table-view`, because a preference the device is
already expressing in the open, where the table can see it, does not want
writing down as well. The rotate prompt is what teaches it, and it is asked once
per **deal**: `Table` remembers which `room.gamesPlayed` this phone has been
seen in landscape for, so a phone already sideways when the cards come out is
never prompted, and the next deal asks again. Do not make the prompt a
once-ever flag — sitting down to a new hand is when a phone gets picked up, put
down or handed over.

Things that will read as oversights in that view and are not:

- **The peek strip shows no hands, at any size.** It carries the room code, the
  piles, the card in play, whose turn and the sun, and that is the whole list.
  It can be that thin because `sunnyReach` already feeds the picker the evidence
  a call is made from; seeing every hand is what *noticing* a reach is easier
  with, and turning the phone upright is the answer to that. A sliver too
  small to read a rank off is worse than nothing (`fan.ts` has a floor for
  exactly this).
- **The draw pile in the strip stays tappable when you hold a play**, with no
  warning, same as everywhere else. A compressed view is a tempting place to
  quietly add a guard rail; it isn't one.
- **A judged call hands the screen back to the full table.** The peel rewinds
  the pile with two cards marked and then rules on it (#63) — the one moment the
  whole table watches — and it cannot play out in a 40px strip. The hand view
  steps aside for `peeling || announcing || caughtHold`, offender's dialog
  included, and comes back after.
- **Both pickers dock rather than overlay.** They take their room out of the
  column, and the hand steps down a card size to make it. Laying them over the
  hand was the obvious thing and it covers the cards the picker is asking you to
  compare against — the same trade the full table already refused.
- **The accusation picker is one row of cards, whatever the offender holds**,
  fanned by the same arithmetic as everything else here and floored at
  `PICKER_TIGHTEST`. That is what makes docking work: a picker whose height came
  in card-row steps had to be capped at a fraction of the column, and then the
  picker scrolled inside its cap *and* the hand under it scrolled its own
  overflow, because `handSize` had no rung below `lg` to step down to. It has
  one now. Nothing in the column scrolls while a call is being composed — do not
  reintroduce a cap, a wrap or a scroll to fit a bigger hand in. The overlap is
  a layout, not a hint: every card leaves the same sliver, so it still says
  nothing about which of them was legal (#96).
- **The rotate prompt is the mechanism, not a fallback.** `screen.orientation
  .lock()` needs fullscreen and iOS Safari has no implementation, so no page can
  turn somebody's phone. The panel is gated on a coarse pointer and a short side
  under 500px — never on a user agent — so a portrait iPad is never blocked, and
  nothing pauses behind it. It blocks the *first* upright look at each deal and
  nothing after it: once this phone has been turned, upright is a view rather
  than a mistake.

### The shared table screen

An optional extra device at `#/r/ABCD/table`, showing the middle of the table.
**Nothing depends on it existing** — it is why the phone view carries its own
peek strip.

- **It shows no hand, at any size, ever.** A screen in the middle of a room is
  visible to everyone including whoever is walking past. Seats get a name and a
  count.
- **It cannot act**, and that is enforced at the server rather than here: it
  joins as a watcher (#16), and every seated message is refused.
- **It is drawn without `TableMotion`.** Cards flying between hands nobody can
  see would describe movement this screen doesn't show, and the flight layer
  portals to the body where the board's scaling can't reach it. The peel is CSS
  on the pile and runs regardless.
- **One design, scaled** (`fitScale.ts`), rather than each piece in viewport
  units. Sizing every piece independently gets the type right and the
  *relationships* wrong — a board recomposing itself at every aspect ratio is
  exactly what a screen propped at a table shows up.

### Wake locks

Held while a table screen is showing a room, and while a phone is in an **IRL**
room with a game underway. Never in an online room: someone playing on their
laptop has an OS that knows what it is doing.

The lock is dropped when a tab is hidden and **is not given back**, so
`useWakeLock` re-requests it on `visibilitychange` — without that it survives
exactly one lock screen and then quietly stops. Failure is silent: battery
saver, an old browser and an insecure origin all just mean no lock, and a wake
lock is a nicety nobody asked for.

## Architecture

npm workspaces monorepo, one Docker image, one process.

- `packages/engine` — pure rules. **No I/O, no `Date.now()`, no `Math.random()`.**
  All randomness comes from an injected seeded RNG and is recorded in the event
  stream, so every game replays exactly. Imported by both the server and the
  browser so the rules exist once.
- `packages/server` — Fastify + `ws`. Authoritative referee: clients send
  *intents*, the server validates through the engine and broadcasts *events*.
  Also serves the built web bundle in production.
- `packages/web` — React + Vite + TypeScript + Tailwind, `oxlint`.

**`packages/engine/src/redact.ts` is the security boundary.** Nothing outside it
decides what a client may see. Hands are not what it guards — every hand is face
up — but `state.challenge`, `state.sunny` and the deck are, and there is a test
that serialises a redacted payload and asserts none of them appear anywhere in
it. Any new field on the game state has to be considered there, and it defaults
to *not* being sent.

## Testing

- Engine tests are the safety net for the rules; every rule in `docs/RULES.md`
  and every Sunny branch gets one.
- Full games are simulated with seeded RNG and bots. Three invariants hold after
  **every** event: **card conservation** (hands + deck + face-up pile == 52),
  forced play is never skipped, and every game terminates with exactly one
  winner.
- No login exists anywhere in this app. Don't add one — not for hosts, not for
  persistence, not for convenience. Identity is a `playerId` plus a secret
  rejoin token in `localStorage`.
