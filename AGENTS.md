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
- **The server does say whether a draw was illegal — slowly.** This one reversed
  in #31, and the old rule ("that flag must never leave the server") is gone.
  `GameView.sunnyWouldLand` carries it to anyone who could call, and the sun
  icon spends ten seconds ramping from barely visible to unmissable. The trade
  was made with eyes open: a player watching the table still calls it sooner
  than one who isn't, and a call is available on any draw regardless, so the
  button's mere presence still reveals nothing. Do not "restore" the old
  behaviour, and do not shorten the ramp — the ramp *is* the balance.
- **Bots never wait for a Sunny window.** Their pacing is turn rhythm and
  nothing else, and `botPace` has no input that could tell it a call is on
  offer. A window opens on every draw, so a bot that held off would be stalling
  the table almost continuously — and a bot pausing after its own draw so the
  seat next to it might accuse it is the worst of it. This means the sun's
  ten-second ramp usually won't finish before an ordinary bot move shuts the
  window; that is the accepted cost, not a regression. Don't reintroduce a
  grace period. (#56)
- **The drawer is never told they've been caught**, and neither is a spectator.
  `sunnyWouldLand` is gated on being able to call. The whole `state.challenge`
  object, snapshot and all, still never leaves the server.

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
