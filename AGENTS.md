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
- **Bots never wait for a Sunny window.** Their pacing is turn rhythm and
  nothing else, and `botPace` has no input that could tell it a call is on
  offer. A window opens on every draw, so a bot that held off would be stalling
  the table almost continuously — and a bot pausing after its own draw so the
  seat next to it might accuse it is the worst of it. A human therefore has only
  as long as the next bot's ordinary move to get a call in; that is the accepted
  cost, not a regression. Don't reintroduce a grace period. (#56)
- **The drawer is never told they've been caught**, and neither is a spectator.
  `sunnyReach` is gated on being able to call. The whole `state.challenge`
  object, snapshot and `violation` and all, never leaves the server.
- **A wrong call costs no cards.** It locks the caller out for three draws
  (`SUNNY_LOCKOUT_DRAWS`) and that is all. The old card forfeit was a
  digital-era invention to stop free guessing; the game's original written rules
  never had any wrong-call penalty, and naming the card does that job now. The
  lockout is visible only to the player serving it.

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
