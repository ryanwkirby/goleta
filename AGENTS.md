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

Merging to `main` deploys. A repo-scoped self-hosted runner on the Mac mini —
the only machine with the `goleta` label — force-checks-out `main` in
`/Users/ryan/git/goleta`, rebuilds with `docker compose up -d --build`, and then
polls `127.0.0.1:8063` until it answers. **Let the run finish and confirm its
health check rather than rebuilding by hand**; a hand-run build racing the
runner is two deploys landing on one live table. **Nothing else should touch the
working tree while a run is in flight either** — the deploy checks out `main` in
this tree, and racing it has no upside.

A build that dies with `load build context: rpc error … EOF` is neither of those
and is not a broken daemon: it is a transient stall pulling a base image, which
buildkit answers by dropping the session and blaming whichever step was in
flight. Re-run the deploy. Do not go looking for who touched the tree — that was
this error's first, wrong explanation (#156).

The health check asks `127.0.0.1` rather than `localhost`, which resolves to
`::1` first, and it is capped with `--max-time`. Both halves are load-bearing:
OrbStack's IPv6 forward is not ready the instant a container is recreated and it
*hangs* rather than refusing, so curl never falls through to the stack that is
answering — and uncapped, thirty attempts of that is fourteen minutes of failing
to notice a deploy that landed in a second (#154). See `docs/DEPLOYMENT.md`.

It runs on push to `main` and on manual dispatch, never on `pull_request`, so
nothing off a branch executes on the machine that holds the rooms. Docs-only
changes still trigger it and that is fine — the image rebuild is cheap and the
health check is the point.

If the runner is ever down, the manual path is unchanged: `docker compose up -d
--build` from the repo root. The runner is installed at
`/Users/ryan/actions-runner-goleta` — **outside** this tree, unlike the sibling
repos, because `"type": "module"` in the root `package.json` would otherwise be
inherited by the runner's own CommonJS service script and kill it on startup.
`docs/DEPLOYMENT.md` has the symptom.

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
- **Your own hand fans in both layouts, but only landscape sizes its cards to
  the row.** Both are measured with `useBox` and stepped by `handFan.ts`, and
  both take `fit`, so a hand closes up before it scrolls and takes a second tap
  once the sliver is thinner than a thumb (#117). What upright deliberately does
  *not* take is `height`: `handHeight` exists because the landscape hand owns
  the whole column and is entitled to fill it, and the upright column is shared
  with the seat strip, the piles, the prompt and the log. The card stays on the
  ladder at `FULL_TABLE.hand` and only the step is measured (#191).

  The consequence worth knowing about is that the squeeze binds much earlier
  upright: a 366px column is the last one-tap hand at seven cards, against
  fifteen sideways. That is the trade — a hand you have to scroll to read is a
  play you cannot spot, and #117 already decided what to do below the tap floor.
  A laptop's `max-w-3xl` column never reaches it.
- **The app does not tell you which of your own cards are playable either**, and
  the turn prompt won't say whether you have a play. Restoring the highlights
  unconditionally removes the chance to make the mistake the Sunny Rule feeds
  on (#33).

  **It is a setting you keep, not a countdown (#187).** It used to be offered
  once, on the way in, run for exactly one game and then stop — a fork in the
  road taken before you had seen a card, expiring on a schedule nobody chose.
  Now it is a preference: a toggle at the foot of the rules screen, a question
  after your first finished game that offers rather than announces, and your own
  cog at any time after that.

  What makes that safe rather than a free silent switch is that **it is public,
  and it stays public**. `SeatView.hinted` carries it to the whole table,
  switching it **on** is shouted like `want help?` is, and the seat carries a
  standing mark — in the strip and on the shared screen — for as long as it
  lasts. Switching it **off** is silent: giving up an advantage is nobody else's
  business. So help is still always there and taking it is still never quiet;
  what is gone is only the expiry. Do not make it quiet, and do not make it
  expire again.

  It is presentation, never a rule: `packages/engine` never learns it exists,
  it is not on `GameOptions` or `HouseRules`, and no bot may read it — that
  would be the view leaking into pacing. `assist`'s two other sources are
  untouched: the forced play after a landed call, and a single turn bought with
  `want help?`. The turn prompt's "you have a card that matches" follows the
  same toggle, because that sentence gives the answer away as surely as the
  highlights do.
- **The edges of the screen glow when the table is waiting on you, and that is
  the only thing they say (#190).** Knowing it was your turn used to require
  reading — a prompt and a one-pixel ring — and at a table of six with the
  phone flat on the felt, the commonest thing anybody said out loud was "it's
  you". `TurnGlow` answers *is it me*, in the amber the ring and the prompt
  already use, at the physical edge of the display where the felt already
  bleeds (#124).

  Three things it must never become. **It says nothing about your cards** —
  same glow whether you hold a play, are stuck, or are about to be caught; the
  bullet above is why. **It is not a timer**: no ramp, no pulse, no
  intensifying, because that would be pressure on exactly the decision the
  Sunny Rule wants people to take their time over — and a thing that never
  moves is also the whole of what `prefers-reduced-motion` needs here. **And it
  does not replace the prompt**, which still says what is being asked for.

  It follows `waitingOn` rather than whose turn it is, which is what makes it
  cover naming a suit under Power of Eights and the card owed after a landed
  call. A watcher never gets it and the shared screen has none — that screen
  has no "you", and it already turns to face whoever is up next (#160).
- **Whether a draw was illegal never leaves the server.** No field carries it,
  and nothing on screen — no glow, no ramp, no ordering, no wording — separates
  a legal draw from an illegal one. The sun has exactly one appearance and it
  means "somebody reached, and you may accuse them."

  It got much bigger in #189 and that did not change: **a bigger sun must never
  become a brighter one when a call would land.** Nothing on the client knows
  whether it would, and nothing ever will. `SunnyCall` has one look, plus a
  disabled one for a caller serving their own lockout — which the server sends
  to nobody else, so a locked-out caller is indistinguishable from any other on
  every screen but their own.

  This bullet has been round the houses, so the history is worth keeping. #31
  reversed the rule and shipped the answer as `GameView.sunnyWouldLand`, behind
  a ten-second glow ramp, on the reasoning that a wrong call cost the caller a
  card and free guessing needed a brake somewhere. #50 reversed it back, because
  requiring the caller to **name the card** is a far better brake: a guess now
  has to be a specific claim, made out loud, that can be specifically wrong. The
  tell had nothing left to buy. Both the flag and the ramp are gone; do not
  reintroduce either, under any name.
- **The call leaves the seat, and that is the point rather than a side effect
  (#189).** It was a 20px circle wedged between somebody's name and their card
  count, in a strip that scrolls sideways — half a thumb, aimed at by eye, for
  the one control in this app whose window closes when the next player takes
  their first action. A missed tap was usually a missed call.

  There is only ever one `sunnyTargetId`, so the control names them — *call it
  on Angela* — which is what stops a call being a thing you do to a name in a
  list. It is 44px in both layouts, it is over the felt near your own cards in
  both, and it is nowhere near the draw pile in either. It is **absolute** in
  both, because it must arrive with some presence without moving the cards
  underneath it; with a wide fan it sits over a corner of the outermost card,
  which is the cost the two bottom corners already pay (#167) and a cheaper one
  here, since a window is only ever open on somebody else's turn.

  Tapping it opens the picker and does not call. An accusation names a card, so
  the tap that starts one cannot be the tap that commits it — and opening the
  picker sends `composingCall`, which holds the bots (#73), so the bigger target
  buys time twice over. The shared table screen has no sun and gets none: it
  cannot call.
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
- **Bots play the card and name the suit the seat ahead of them *can* answer**,
  which reads as a blunder and is the reversal doing its work. Playing is
  compulsory, so leaving the next player a match costs them a card; stranding
  them hands them the best turn in the game. Reading their hand to do it is not
  the bot cheating and not the view leaking — every hand is face up, and
  `docs/RULES.md` says naming a suit is not a guess for exactly that reason.
  What a bot never does is take the answer from `GameView`: `legalCardIds` is
  its own hand and nobody else's, so anything it concludes about another player
  it works out from `isPlayable` itself.

  It looks **one seat, one question**, and that ceiling is the design (#107).
  No counting the deck, no reading further round the table, no modelling what
  comes back. The old preference — shed your scarcest suit, name the suit you
  hold least of — survives underneath as the tiebreak, and still decides
  outright in the two places the reading rule has nothing to say: the play owed
  for a landed call, which is buried under the punishment card and the turned-up
  draws before anyone plays against it, and a suit named under **Power of
  Eights**, where the namer is the player who then has to follow it and the rule
  would have a bot name a suit against its own hand.
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
- **`namedSuit` is on the game state and no rule reads it.** That is not dead
  state. `activeSuit` says which suit must be matched; `namedSuit` says a person
  *chose* it, and the second is not recoverable from the first. A namer who picks
  the 8's own suit leaves a state identical to a natural 8 seeded at the start,
  turned up by a recycle, or played to settle a Sunny call — and naming your own
  suit is a real play, the one that leaves the next seat something to follow. The
  pile used to infer it by comparing `activeSuit` against the printed card, and
  was silent on exactly that play (#114). Set only in `chooseSuit`, cleared
  wherever the card in play changes, and read only by `lib/pile.ts`. Don't move
  it into `activeSuit`, and don't tidy it away for having no rule behind it.
- **A suit that has been asked for and not given is marked at the pile**, and
  that is not #76 coming back. #76 was the pile *naming a suit* through that
  window — a confident badge holding `activeSuit`, which through a pending call
  is still the board from before the 8, so the answer it gave was a suit nobody
  had chosen. This says only that one is owed, in the badge's own place, and
  names nothing. `pileSuit` returns *owed* or *named* as one value for exactly
  that reason: the two are drawn in the same place, and a caller that could
  reach for a bare `Suit` is a caller that can print the stale one again.

  The silence #76 left was the more expensive mistake, which is why the question
  it recorded as open is answered the other way now. A board about to be replaced
  looked exactly like a settled one, so a player read their hand against it,
  reached for the deck, and had the suit land under their finger and make that
  reach illegal (#150). **The answer is information at the pile, never a gate on
  the deck.** No delay after a suit lands, no cooling-off on the draw button, and
  nothing that keeps a tappable pile from being tapped — the first bullet in this
  section still holds, and a guard rail there would be buying with the whole
  Sunny Rule what a `?` buys for nothing.
- **A reshuffle holds the table for about five seconds, and holds nothing else
  (#209).** The deck running out is one of the biggest things that happens in a
  game and it used to pass in under half a second — three face-down cards, and
  less than that in practice, because a recycle always arrives batched with the
  `drew` and `turnedUp` around it and `BATCH_CAP_MS` squeezed the burst. People
  read it as the game skipping ahead and asked what had happened.

  `RESHUFFLE_MS` sits beside `PEEL_MS` and `ANNOUNCE_MS` because it is the same
  kind of number: the length of a moment the whole table is in, so the timing is
  a hook read off the log (`lib/reshuffle.ts`, the shape `useJudgedCall` set)
  rather than a decision either screen makes. The words go on the **prompt
  line**, which is the one surface all three screens have — the log says it too,
  and the log is drawn on exactly one of them.

  Four things it must not become. **Every card in it stays face down**: the
  recycled pile is shuffled and its order *is* deck order, which `redact.ts`
  guards, and the only face this moment shows is the card turned up at the end.
  **It is presentation, never rules** — no server change, no engine event, and
  `DEFAULT_BOT_TIMING` untouched, so bots may well move underneath it exactly as
  they do under the peel. **It is not a gate on anything, least of all the draw
  pile**, which stays tappable throughout with no warning and no disabled state;
  five seconds of animation is a tempting place to quietly break the first rule
  in this section. And **it queues behind a judged call rather than racing one**,
  because a recycle can land in the same breath as a call and a landed call
  rewinds the recycle — the peel goes first, always.

  `compress` learned a `floor` for it. The cap is about a queue nobody is
  watching any more; a hold is the opposite. It used to measure the span from
  the earliest flight, which worked only because the peel opens its batch — a
  recycle sits in the *middle* of one, so measuring from the first flight
  squeezed five seconds into 900ms.
- **The suit picker waits for the deal, and nothing else waits for anything.**
  `MotionApi.dealing` is the only "this layer is busy" the motion code exposes,
  and it is deliberately about the deal rather than about movement in general.
  Exactly one prompt can arrive before the thing it is asking about: under
  **Dealer's Choice** the game opens in `phase: "suit"`, so the dealer was asked
  to name a suit for an 8 that had not landed, on a pile that was not there yet
  (#75). Every other prompt describes a state somebody can already act on, and a
  card in the air is no reason to hold one back — do not grow this into a
  general gate on `flights.length`, which would quietly delay every picker and
  every prompt behind the nearest animation.

  The engine is untouched by it: `startGame` opens in the suit phase the moment
  the game starts, and that is correct. This is the screen catching up with the
  state, never the state waiting for the screen. The line and the picker are
  gated **together** — a prompt asking for a suit above a picker that isn't
  there is worse than the thing it replaced — and it is counted off the deal's
  own flights as they land rather than timed, so reduced motion, which plans no
  flights at all, waits for nothing.
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
- **The felt bleeds to the physical edge; the content insets from it.**
  `index.html` opts into `viewport-fit=cover`, so the four
  `env(safe-area-inset-*)` values are this app's problem — and `body` already
  paints the felt behind everything precisely so nothing here needs a
  background of its own. Insets go on the content layers, always as
  `max(designed-padding,env(…))` so the hardware is a floor rather than a
  replacement, and never as a blanket padding on `#root` — that is a flex column
  with `min-height:100%`, and padding there fights the `h-dvh` in `HandView` and
  `TableScreen` and pushes their bottoms off the screen. No user-agent checks
  anywhere: `env()` already answers per rotation and gives zero on hardware with
  nothing to avoid, so nothing needs to know what a phone is (#124).

  **In landscape the fan gives up width to the island rather than sliding under
  it**, which is the one real cost in here and is deliberate. The insets sit on
  the row `useBox` measures, so `handStep` is handed the corrected width and
  closes the fan up by the rules it already has — nothing subtracts hardware by
  hand. `fan.ts` has a floor because a card you cannot read is a play you cannot
  spot, and an end card behind the island is that same failure arriving by a
  different route. Letting the row bleed would keep the arithmetic looking
  healthy while the hardware quietly overruled it.

## House rules

A table can vary three things, all of them rules the game already had written
down: the two alternates from the original rules (**Power of Eights**,
**Dealer's Choice**) and whether the **Sunny Rule** is played at all. They live
on `GameOptions`, are the host's to choose, and apply at the next deal.

**The host can change them mid-game, and that is not a loophole.** They are read
exactly once, at `beginGame`, which hands the game its own copy — so what the
host is editing is always the *next* deal and can never reach a hand already
out. The lobby has them and so does the settings cog behind the table (#134),
and the panel says which of its two halves takes effect when. Two things keep
that true and both are load-bearing: `setHouseRules` replaces `room.options`
wholesale rather than editing it in place, and `beginGame` spreads it into a
fresh object on the way to `startGame`. Don't make either of them share.

**Your own cog is a different door (#188).** Every seated player has one, top
left, beside the host's where you are the host. The bar for putting something in
it is that it belongs to one player and changes nothing about the room — today
that is the hints toggle and nothing else, and #202 is the other candidate. The
host's cog says *table settings* and this one says *yours*, so they are a gear
and a person rather than two gears: two doors an inch apart, one of which
changes the game for everybody, want the difference to be legible. A watcher
gets no cog, because the only thing in it is about cards they do not have.

**Bot speed is the one that stays frozen**, and it sits beside them in the lobby
looking identical. It is read *live*, every time a bot is scheduled, so moving
it mid-game moves a challenge window somebody is already watching. That is why
it is not in the cog, and why `setBotSpeed` keeps its "wait for this game to
finish" while `setHouseRules` no longer has one.

**Shuffled seats are the other one (#199), and the same shape.** A table can
reorder itself at each deal. Seat order is turn order, so it is not cosmetic —
it changes who follows whom, which is the point. `beginGame` shuffles
`room.seats` before anything reads the order, with the engine's Fisher-Yates on
a server-generated seed, and the deal is passed *in the new order*: the last
dealer is looked up by id, so they are found wherever they landed and only their
neighbours change.

**The IRL half is the actual feature, and the two ship together.** An IRL room
gets a "take your seat" screen — the new order, numbered, your own seat called
out — before it draws the table, off `seatsShuffled` on the `gameStarted` event.
A setting that reshuffled turn order every hand and said nothing would undo
everything the lobby does to make turn order and physical order agree: the app
would deal across the table and back and it would be three turns before anybody
noticed. Online rooms just deal in the new order, because there is nobody to
move. Do not ship the shuffle to an IRL room without the screen.

It is independent of the dealer setting. With both on the shuffle largely
subsumes the rotation, and that reads sensibly rather than needing them made
exclusive.

**Who deals is a room setting rather than a house rule (#198).** A table can
have the deal rotate one seat a game, or drawn at random. It lives on `Room`
beside `irl` and `botSpeed`, is carried on `RoomView.dealerMode`, and
`packages/engine` never learns it exists: `startGame` takes a `dealerIndex` and
has never cared how it was chosen — rotation is a `rooms.ts` convention, and
`docs/RULES.md` says dealing is all the dealer does. `HouseRules` on the wire
stays the three written alternates and nothing else.

It is read once, at `beginGame`, so it is **not** frozen mid-game — the house
rules' argument, not bot speed's. A random draw may land on the same seat twice
running; that is the honest answer for a random pick, and a table that objects
is describing rotation. Off by default, and it goes to the whole table rather
than the host alone, because who deals decides who opens.

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
numbers the seats and gives the host up and down arrows — and, since #197, a
handle to drag a name by. **The arrows stay**: they are the keyboard path and
the precise one, and a drag handle is neither, so the grip is `tabIndex={-1}`
and `aria-hidden` rather than a second way of describing the list.

**A drag sends the message that already exists.** A drop three places up is
three `moveSeat` hops, not a new `order:` field — an order posted from a browser
can arrive after a seat has left, and a stale permutation is a worse thing to
reconcile than a swap that no longer applies. It is also what makes a list
changing mid-drag harmless: a hop is relative to wherever the server has that
seat, so the worst case is a name one place out rather than a wrong order. The
first deal into an IRL room asks *"Does the seat order look correct?"* once. `moveSeat` on the
wire is deliberately **not** gated on `irl`: which rooms are worth offering
arrows in is a presentation call, and refusing the message would throw an error
at a host who flipped an unrelated setting mid-shuffle. Moving off either end
does nothing rather than refusing, for the same reason.

A table has **two views, one brain**. `Table.tsx` holds all the state — the
Sunny state machine, the stall timer, the assist, the sort — and picks a layout
at the bottom. `HandView` is the landscape one: a peek strip, and the whole of
the rest of the screen given to your hand. Anything that needs table state
belongs on `Table`; the layouts are given what to draw.

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

- **The peek strip shows no hands, at any size.** Of the table it carries the
  room code, the piles, the card in play, what the table is waiting for, and
  somebody asking for help — and that is the whole list. The sun was on it
  until #189 and is deliberately off it now: it was drawn immediately before
  the draw pile button, so a bigger version of it could only grow *towards* the
  deck, and a fat target beside the deck is a mis-tap into the exact violation
  it accuses. It hangs under the strip instead, at the far end from the pile.
  The
  fullscreen offer is the first item on it that is not a table fact, and it is
  here because this is the only surface the landscape view has: `RotatePanel` is
  shown only to a phone held *upright*, and a phone already sideways when the
  cards come out is deliberately never prompted — so an offer that lived there
  was unreachable from the orientation it was about. It is feature-detected on
  `requestFullscreen` existing, never on a user agent, so an iPhone gets no
  control rather than a dead one; it takes itself away once fullscreen is held
  and comes back when the browser drops it, which the exit gesture and
  backgrounding both do. Don't persist a preference for it — re-entry needs a
  gesture regardless, so a stored one could never be honoured silently, and it
  would be a second staler source of truth about a state the browser already
  reports (the reasoning that removed `goleta:table-view`). It can be that thin because `sunnyReach` already
  feeds the picker the evidence a call is made from; seeing every hand is what
  *noticing* a reach is easier with, and turning the phone upright is the answer
  to that. A sliver too small to read a rank off is worse than nothing
  (`fan.ts` has a floor for exactly this).
- **The host's cog and the way back to the rules are the other two, and they
  are here because they were nowhere (#194, #195).** `HandView` has no header,
  so the cog the upright table draws in its own simply did not exist in
  landscape — and a host at an IRL table *is* a host holding a phone sideways,
  which is the whole point of that view. The rules had the same gap and it is
  the worse one: landscape is the IRL view, an IRL table is where the new
  players are, and looking a rule up is a thing that happens mid-hand.

  Both live in the **small-print cluster at the left**, which is the only part
  of that row allowed to wrap and therefore the only place a new control may
  take its width from. The right-hand end belongs to the prompt, the sun and
  the deck, and the strip itself still never wraps.

  The cog is **44px in both layouts and the same shape in both** — it was a
  16px glyph in a 24px box, in a header of small grey print, and hosts did not
  find it. In the strip its target is painted out of a shorter row box, because
  the rule above it is that two lines of small print stay shorter than the pile
  card beside them, and what a full-height line would spend the difference out
  of is the hand. The rules link opens the same screen the upright header does,
  **without** the first-run hints question: that belongs to the first time
  through, not to a mid-hand look-up, and nothing pauses behind it — a
  challenge window can close while you read, exactly as it always could.
- **The room code is the invite, on every screen, and tapping it is how (#135).**
  A code is the address of the room, and the two things that can arrive at one
  are a **person** and a **shared screen**: same code, different link, which is
  exactly what a QR should be hiding. The player invite leads, because a screen
  is set up once and a person turns up all evening.

  **During a game it is a one-character QR glyph rather than the four
  characters** (#162). The panel behind it leads with the code at reading-out
  size, so what the characters were adding on the strip and in the top band was
  width: the glyph says *there is a way in here* and the panel says the rest.
  It is drawn rather than typed — a Unicode square is a gamble on the device's
  font, and this has to read as a QR at three type sizes and again on a
  television. The waiting state keeps its full-size code and its actual QR;
  that screen exists to be scanned from across a room.

  **The shared screen has it too, and until #162 it was the one surface where
  the code was not tappable** — four grey characters in a `<p>`, so a table
  wanting to add a player mid-hand had to go and find somebody's phone. The
  panel renders *outside* the design box, alongside `TableRotateNudge` and for
  a stronger version of the same reason: inside, `fitScale` would scale it and
  the quarter turn would stand it on its side, and it is a panel somebody is
  holding a camera up to.

  **Anybody may open it, not just the host.** Handing somebody the way in is not
  a host power at a real table, and nothing behind it changes the room — two
  links and a code every player can already read off their own screen.

  The panel shows the **code above the QR, at reading-out size**. A camera is
  the fast path and not the only one, and "what's the code?" across a table is
  how this actually goes. And the note about a hand being under way hangs off
  the *player* invite only: a shared screen joins as a watcher, which is what it
  is for, so a running game is no obstacle to it. That note is careful about
  what it promises — a seat is refused for the length of a hand and the Join
  screen offers a watch instead, but **a watcher is not dealt in when the next
  game starts**, so nothing here may say they will be.
- **There is still no row under the cards, and the two controls that belong
  down there are laid over the felt instead.** The sort control, the offer of
  help when you have sat on a turn, and the draws left on a missed call used to
  sit in a footer, and the footer cost the hand a card size: `handHeight` reads
  the height the row is left, so a line of small print is paid for in cards
  (#131). #131 answered that by moving all three onto the strip; #167 keeps the
  rule and moves two of them back down, as absolute corners **outside the box
  `useBox` measures** — the offer of help at the bottom left, the sort at the
  bottom right, where a hand is and where they are about. Measured on a
  landscape iPhone, the cards are the same 289px tall either way, which is the
  whole point of them not being in the column.

  They sit **over** the cards rather than under them. Since #166 the hand runs
  to within twenty pixels of the bottom, so a wide fan reaches both corners, and
  printing you cannot press is not a control. Small, quiet, and accepted.

  The missed-call notice stays on the strip: it is yours alone and it is not
  something to press. What the table is
  waiting for is said there in full rather than as whose turn it is, because the
  prompt is a superset of the line the strip already carried.

  It is **one line that never wraps**, and the give is inside the small print at
  the left, which wraps within itself. A row that wraps has to wrap whatever no
  longer fits, and the last child here is the draw pile — the one thing on the
  strip that has to be reachable, and a card's height to push onto a second
  line. Two lines of small print are shorter than the pile card beside them, so
  the crowded hand costs the cards nothing.
- **The cards are as tall as the row, not as tall as the nearest rung** (#166).
  `handHeight` returns a number and `PlayingCard` takes a `height`, with the
  card's width, type, padding and radius following from it by the fractions in
  `CARD_SHAPE` — read off `2xl`, so a card drawn this way at 240 is that rung to
  the pixel. The ladder stays everywhere else, because it is what keeps a card
  the same size in a seat strip on two different screens.

  The ladder's top two rungs were 64px apart, so a row of 280 drew a 240 card
  and a row of 279 drew a 176 — two-fifths of the height handed back over one
  pixel. On a landscape iPhone the card went 240 → 289 and the felt under it
  44 → 20, which is the `py-4` the turn ring needs and nothing else.

  The row is `justify-end` rather than `justify-center` as well. It does almost
  nothing now — the cards fill the row, so there is no slack to place — and it
  is the right default for the two cases where there is: a row taller than
  `TALLEST`, and one shorter than `SHORTEST`. Leftover belongs above the cards,
  not split into a band of bare felt beneath them.
- **A card drawn `mirrored` has no ghost pip.** The big faded suit in the
  bottom-right corner is the corner the second index sits in, so in an IRL room
  it was decoration underneath an upside-down rank, on the screens where reading
  a rank off a sliver is the whole job (#130). Online rooms keep it — nothing is
  drawn over it there.
- **The ask for help is on that list because it has to be somewhere.** Taking
  help is public by design (#33) and the upright table draws the shout over the
  asker's seat — but an IRL table is every phone in the landscape view, which
  has no seats, so somebody else's ask landed nowhere at all and the one room
  where it was meant to be loudest was the one where it was silent (#105). It
  names who asked, carries nothing else, and the shared table screen shows the
  same thing against the seat. Your own still rises off your own cards.
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
  overflow, because `handSize` had no rung below `lg` to step down to. There is
  no ladder left to run out of: `handHeight` is a number, so the hand gives back
  exactly what the picker took (#166). Nothing in the column scrolls while a call is being composed — do not
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

  **Nothing anywhere reaches for that lock, including where it exists.** The
  panel used to offer it behind a "keep it landscape" button, and it froze the
  app's only view switch: locked, turning the phone upright did nothing,
  `useIsPortrait` never flipped, and that player could not reach the full table
  for the rest of the session. Half the app, deleted by a button, on the one
  screen whose whole job is teaching the gesture it disabled. **Fullscreen
  without the lock is the whole of what was worth having** — it survives a
  rotation, so a player who takes it in landscape still has it upright (#125).

### The shared table screen

An optional extra device at `#/r/ABCD/table`, showing the middle of the table.
**Nothing depends on it existing** — it is why the phone view carries its own
peek strip. A table may have **more than one**, and the lobby draws a row per
screen that is actually connected (#138), off `RoomView.tableScreens`.

That count is **connection state and never room state**: `socket.ts` counts the
open sockets that called themselves a table each time a view is built, and
`roomView` takes it as an argument. Nothing to clear on load, nothing to leak on
a dropped connection, and no way for it to disagree with the sockets that are
open. Do not move it onto `Room`, and do not persist it — a restored snapshot
has nobody connected to it, the same reason `seat.connected` is cleared on load.
The rows are also what closes the invite dialog: it dismisses on the count going
*up* while it is open, so it answers the scan that just happened (#139).

- **Its default view is the shared centre**, and it shows no hand there. Seats
  get a name at the edge they are sitting on, a count, and — for the couple of
  seconds it lasts — that they have asked for help.

  The default is the whole of the old rule, which read *no hand, at any size,
  ever*, on the reasoning that a screen in the middle of a room is visible to
  everyone including whoever is walking past. #120 kept the reasoning and
  narrowed the rule to a default: the toggle in the corner — two icons rather
  than two words since #168, because everything else in that band is a glyph or
  a number and a word there reads as a heading for the view you are in about as
  readily as a way out of it — shows the same hand strip a watcher sees, and it is a deliberate act by somebody in the room who
  can see who else is in it. It is never what the screen comes up in, it is not
  remembered, and the centre piles stay large in both views. Do not make it the
  default, and do not persist it.
- **It has exactly one auxiliary action**, in the sense that matters: one thing
  it can do that reaches the server. It still joins as a watcher (#16), with a
  `table` bit on the watch message. (Opening the invite is not a second one —
  it is a local panel over two links and a code, and it changes nothing about
  the room.) In an IRL room, while the game is
  waiting on an ordinary action, tapping its draw pile draws for the current
  player. It cannot play, name a suit, call Sunny or surrender.

  **The bit is the client's own word for what it is**, so it narrows rather than
  grants — any browser can send it, and the honest reading is that in an IRL
  room any watcher may draw for the seat on the clock. That is why `irl` is the
  gate that matters and why it is checked on the server: an online room is
  strangers, and none of them get to move a stranger's hand. In a room where the
  flag means what it says, everybody can already reach the propped-up screen
  with their actual hand. There is no identity to check here and there will not
  be one — see the note on logins under **Testing**.

  **A bot's turn is refused too.** The pile is drawn tappable to the whole room
  and a bot's turn goes past under a finger already on its way down, so without
  that check a tap lands on the bot — and a bot made to draw while holding a
  play has been handed a Sunny violation it never chose. Bots are decided and
  paced on the server for exactly that reason; nothing off a screen moves one.
- **It is drawn without `TableMotion`.** The flight layer portals to the body
  where the board's scaling can't reach it. Draws get a local flight toward the
  player's edge; the peel is CSS on the pile and runs regardless.
- **One design, scaled** (`fitScale.ts`), rather than each piece in viewport
  units. Sizing every piece independently gets the type right and the
  *relationships* wrong — a board recomposing itself at every aspect ratio is
  exactly what a screen propped at a table shows up.

  **On an upright screen the same design is turned a quarter** rather than
  laid out again (#141). `shouldTurn` asks it as arithmetic — does the turned
  box fit more of the design than the box as given — so there is no user agent
  anywhere in it and it still holds if `TABLE_DESIGN` ever changes shape. The
  case it exists for is a phone standing in for a spare tablet: held sideways an
  iPhone fits the board at ×0.57 and upright-and-turned at ×0.66, because
  Safari's chrome takes a far bigger bite out of the short side. A shared screen
  lies flat with people round it, so which way up the device is means nothing to
  anybody reading it. `TableRotateNudge` asks for upright and can be waved past;
  it is not `RotatePanel`, which guards a layout that cannot be drawn the other
  way and has no way past — this one is a spectator device holding no cards.

  Because the turn is one uniform transform, **anything that does not overlap in
  the design does not overlap on screen**, at any size and either way up. That
  is what makes the design box the only place the layout has to be right.

  **That guarantee covers the board's transform and nothing else, so no piece
  gets a scale of its own** (#159). The piles used to be `scale-[2.5]`, and a
  paint transform is invisible to the layout around it: they were laid out at
  their unscaled 198px, centred in the full height of the design — the container
  asked for `top: 0, bottom: 0`, alone among the placements here — and the ink
  then grew about its own middle, into the band the seat names live in, until a
  name was drawn on top of the draw pile. The scale is **asked for** now:
  `pileBox` says how much they paint, `fitScale` says how much of that the room
  between the bands will take, and the wrapper reserves the answer, so the box
  the layout sees and the ink on the screen are one rectangle. `pileBox.test.ts`
  holds it at every card size. Anything else that wants to be bigger should *be*
  bigger in the design.

  Two details in there look arbitrary and are load-bearing. `pileBox` allows for
  the suit circle's twelve-pixel overhang on **both** sides, because the piles
  are centred and an allowance on one side moves the box's centre off the piles'
  centre and hands the overhang straight back. And there is a `GUTTER` between
  the piles and the bands: a name fills 46 of its 48-pixel band, so piles fitted
  flush clear the top name by a pixel and a half, which across a room reads as
  the collision this fixed rather than the absence of one.
- **Texture is the one thing that must not scale, and `--paint-scale` is how it
  doesn't** (#169). The card back's lattice is a *screen* measurement — six
  pixels of thread whatever size the card is — and that constant is what makes a
  40px sliver and a 180px hand card read as one deck. A transform takes the
  background up with everything else, so at ×3.1 the weave landed at nearly
  nineteen pixels and the draw pile became a lattice of Xs.

  Nothing inside an element can see a transform on an ancestor, so the places
  that scale publish what they are scaling by and `bee-back` divides it back
  out. Unset — every phone screen — it is 1 and the pattern is exactly what it
  always was. The two scales are multiplied **by hand** where they meet:
  a custom property that referred to itself would be a cycle and resolve to
  nothing at all. The quarter turn is deliberately not in it, because turning
  changes nothing about how large a pixel is.
- **Nothing is stacked in a column, and nothing may be** (#141). Every piece is
  placed against the design box inside bands reserved for the seat names on all
  four sides (`BAND` in `tableEdges.ts`). The board used to be a `flex-col`
  whose children came to more than the height it had, and `justify-center`
  pushed the surplus out of both ends and through the names pinned to the edges.
  Adding anything back into a flow is how that returns.

  Three placements in here look arbitrary and are load-bearing. **The counts are
  on the names**, because two lists of the same players is what there was too
  much of. **The prompt is in the bottom band**, sharing it with bottom names
  pushed out to the corners — beside the piles is too narrow to read a Sunny
  ruling in, and under them costs the piles the height that *is* the board's
  width once it is turned. And **a name's anchor has no size of its own**: sized
  by its label, a `right`/`bottom` anchor pins the far edge of the label rather
  than the point, which put the right-hand names a third of the way into the
  board.
- **Everything the board says in words faces whoever is playing** (#160), and
  **two positions rather than four**. The names read from outside their own
  edge and everything else was drawn upright, so a player at the top read their
  own name the right way up and the sentence about their own turn upside down.
  Four pieces turn together — the prompt, the deck count, the view toggle and
  the suit at the pile — and the hands view flips its strip by the same rule
  (#163).

  A quarter turn is fine for a name and wrong for the prompt, which is the
  piece that decided it: the prompt carries a Sunny ruling, it is 512 wide, and
  it lives centred in the bottom band because beside the piles is too narrow to
  read a ruling in. Stood on its end it needs 512 of the 560 the board has and
  runs out of both bands. Flipping buys the whole of what was wrong — nobody
  left reading upside down — and a player at the side reads at a slant either
  way, which was never the complaint.

  **Bots are walked past**, and so is anybody out: the board turns towards the
  person who is actually up next, and a table of bots leaves it upright.
  `facing.ts` has it, with a test.

  Two things in there look like details and are not. **The turn does not
  animate.** A 180° transition on a strip a thousand pixels wide sweeps through
  ninety degrees as a spinning plank, and there is nothing quiet about it. And
  **the hands view turns its strip, never the whole panel**: 180° swaps top for
  bottom, so a turned panel puts the piles under the prompt pinned to the
  bottom band — and the piles inside it would be turned by the panel *and* by
  their own `turn`, which comes to no turn at all. The strip's own box is
  `flex-1` as well, so the transform goes on a wrapper the size of the strip;
  turning the box that holds it swings the strip to the bottom of the space.
- **Every name is read from outside its own edge** — the person sitting there,
  not the one opposite. All four were 180° out until #141, which is easy to miss
  because the arrangement looks deliberate either way: the top name was drawn
  upright, and the right-hand one read top-to-bottom, which is what somebody on
  the *left* sees. `TURN_FOR` holds the four angles and a test holds the rule.
- **It is the one surface that offers an install, and that is a pilot (#126).**
  The open question is whether an install prompt belongs in this app at all —
  the identity model is *no accounts, scan a code, play*, and "add this to your
  home screen" is the first thing here that sounds like a signup even though it
  isn't. It is offered here because the friction is lowest and the payoff
  highest: the screen is propped once, by the host, before anything is running,
  and it holds no identity to lose crossing into an installed app's separate
  storage container — which a *phone* would, coming back as a new player with an
  orphaned seat. Which offer appears is four capability questions and never a
  user agent: already standalone, then `beforeinstallprompt`, then `"standalone"
  in navigator` (iOS's home-screen model, so the offer is words and the Share
  sheet — and why an iPad gets the install rather than fullscreen, which leaves
  a non-dismissible overlay button on a screen nobody is going to tidy), then
  plain fullscreen for a laptop or a TV. It shows in the waiting state only,
  never over a game, and one tap dismisses it for good. **Nothing may start
  depending on a shared screen being installed**, exactly as nothing depends on
  one existing — removing the pilot is deleting `TableInstall.tsx`, the manifest
  and its `<link>`, and this bullet.

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
