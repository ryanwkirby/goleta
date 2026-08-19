# Representative change — "you're next"

A benchmark task, not a feature to ship. It is executed by a fresh agent with no
prior context, measured, and then **discarded** (`git checkout .`). It exists to
answer one question: how much does an agent have to read in order to make an
ordinary change to the table screen?

It is deliberately shaped like real past work in this repo — `TurnGlow` (#190)
is the closest analogue: a new piece of derived state on `Table`, gated on
several conditions, rendered in both layouts, saying one thing and nothing else.

---

## The ask

Give a player a quiet heads-up that **their turn is coming up next**, so they
can start thinking before the table is waiting on them.

## Behaviour

Show a small, quiet cue reading `you're next` when **all** of these hold:

1. There is a game running (`game.status !== "over"`).
2. This screen has a seat — `game.you` is not null. A watcher never sees it.
3. The table is **not** already waiting on you (`game.waitingOn !== game.you`).
   Once it is your turn, `TurnGlow` and the prompt have it covered; this must
   not be up at the same time.
4. You are the next player who will be asked to act after whoever the table is
   currently waiting on — walking forward from `game.waitingOn` through
   `game.players` in order, **skipping eliminated players**, and wrapping.
5. You are not eliminated yourself.

## Where it appears

Both layouts, because a phone at an IRL table is sideways and a phone anywhere
else is upright:

- **Upright** (`screens/Table.tsx`) — in the full table view.
- **Landscape** (`screens/HandView.tsx`) — in the hand view.

The shared table screen (`screens/TableScreen.tsx`) gets **nothing**. That
screen has no "you".

## Constraints

These are the constraints a real change here would be held to. They are drawn
from `AGENTS.md`; an implementation that breaks one has not done the task.

- **It says nothing about cards.** The same cue whether you hold a play, are
  stuck, or are about to be caught. It must not consult `legalCardIds`,
  `sunnyReach`, or any hand.
- **It is not a timer and does not move.** No pulse, no ramp, no countdown, no
  animation. Nothing for `prefers-reduced-motion` to reduce.
- **It does not gate or disable anything.** Nothing becomes untappable.
- **It is presentation only.** No change to `packages/engine`, no change to
  `packages/server`, nothing new on the wire, no new `ClientMessage`, and no bot
  may read it.
- Quiet: small type, in the same register as the existing small print. It is a
  heads-up, not an announcement.

## Done means

- `npm test` passes (391 tests).
- `npm run lint` passes.
- `npm run typecheck` passes.

## Explicitly out of scope

Do not commit, do not push, do not open a PR, do not start a dev server, and do
not touch anything outside `packages/web/src`.
