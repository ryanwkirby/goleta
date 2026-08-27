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

### Working a milestone, or "all the open issues"

The seven steps above are written for one ask. The ask that actually arrives here
most often is a batch — *resume M5*, *work through the open issues* — and a batch
needs an order and a PR shape on top of the process, or every session invents its
own. Both failure modes are real: one PR carrying six unrelated issues, which is
unreviewable and unrevertible, and six PRs for six one-line string changes, which
is six rounds of CI and six deploys for ten minutes of work.

- **Read the whole milestone first, then work simplest to hardest.** The reading
  is what tells you which issues touch the same file, and the small ones land
  while the picture is still forming.
- **The extremely small ones ride together in one PR** — a string, a constant, a
  deleted line — with one commit each and every issue named in the body.
  **Anything with a decision in it gets its own PR.** If you cannot describe a PR
  in one sentence without the word "and", it is two.
- **Read the neighbours.** Issues filed in one milestone routinely rule on the
  same moment and say so (#363 and #364 each ask the other to be re-read).
  Whichever lands second re-reads the first, and says in its PR what it found.
- **Some issues say not to start them.** #356 was filed on explicit instruction
  to leave it unresolved. A sweep of a milestone must not quietly pick one of
  those up: ask, and carry on with the rest meanwhile.
- **One PR at a time, all the way through.** Merge, let the deploy finish, confirm
  its health check, *then* branch the next. The runner force-checks-out `main` in
  this working tree, so a branch checked out here while a run is in flight is the
  thing the section below already says not to do.
- **Report what you did not do.** An issue you skipped, deferred or found already
  fixed is part of the answer. Say which and why rather than leaving the
  milestone's count to explain it.

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
- **So does "I'm done", and it is the same rule on a second control (#260).**
  The turn used to end itself after a third fruitless draw. That was one action
  doing two things, and the second shut the challenge window on the first: the
  next seat was on the clock the instant the third card landed, and the third
  reach is the hardest one to judge, because by then the offender is holding
  three more cards than the table has been reading. The turn now stays with them
  until they play or press it, so the window stays open for as long as they take.

  The button is drawn on `GameView.canEndTurn`, which is the engine's one
  condition — three draws, or a deck that cannot be replenished — and **says
  nothing about your cards**: it is exactly as true when the third draw handed
  you a play as when it left you stuck. Pressing it while you hold a play is a
  lie and a callable violation, judged against the board and the hand at the
  moment you pressed it rather than at the draw. Everything in the bullet above
  applies here: no disabled state, no confirmation, no hint, and nothing on any
  screen separating an honest end from a dishonest one.

  Two placement constraints follow from it being a control that can commit an
  offence. **Not near the draw pile** — #189's argument in reverse. And **never
  under the cards**, because `handHeight` reads the room the row is left and a
  control appearing there resizes the hand under a thumb (#131). It goes under
  the prompt, which is the line already saying what the table is waiting for.

  **Bots end their own turns and are never made to end one by anybody else.**
  `decideBotIntent` presses it only when it is genuinely stuck, and the shared
  table screen cannot send it at all — a screen in the middle of a table handing
  somebody a violation they never chose is what the bot check on its draw
  already exists to prevent.
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
  after your first finished game that offers rather than announces, and the
  *yours* half of the cog at any time after that (#253).

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
  bullet above is why. **It is not a timer**: nothing about it may vary with how
  long you have been sitting there — no ramp, no brightening, no second stage,
  nothing that reads as a countdown — because that would be pressure on exactly
  the decision the Sunny Rule wants people to take their time over. **And it
  does not replace the prompt**, which still says what is being asked for.

  **It does breathe, on a fixed period** (#254). It was static until then, and a
  static amber edge on a green screen is something the eye stops seeing inside
  about twenty seconds — which at a table where people are looking at each other
  is most of a turn, so by the time somebody looked down it had become part of
  the furniture. Two seconds down to a quarter, two seconds back, forever: what
  it is doing at second one it is doing at second ninety, which is the whole of
  what keeps it from being the timer above. It is drawn as `opacity` on the overlay
  rather than as an animated `box-shadow`, so it composites instead of
  repainting the viewport, and so both shadows move together rather than
  becoming a second design at the dim end.

  **The figures are the only part of it that has moved** (#295). #254 shipped
  three seconds each way between full and half, which did stop the edge becoming
  furniture but slowly and shallowly enough that the movement itself was easy to
  miss — and what it is fighting is a phone flat on the felt being *glanced* at,
  not stared at. A period and a pair of endpoints are free to be tuned; what
  cannot move is that there is exactly one of each.

  **The dim end has a floor, and it is not a number picked for roundness.** #295
  asked for 5% and asked for it to be looked at, because the glow has to answer
  *is it me* for somebody who glances down at exactly the dim moment. It does
  not: this ink is a soft inset wash, opacity takes it away much faster than the
  figure reads, and `ease-in-out` on an `alternate` **rests** at both ends rather
  than passing through them — so 5% is half a second of every cycle with nothing
  on the screen. Anything deeper than a quarter is the glow going out.

  "A thing that never moves" used to be the whole of what
  `prefers-reduced-motion` needed here, and that is spent: under reduced motion
  the keyframes flatten and the glow holds steady at the bright end, exactly as
  it was before.

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

  There is only ever one `sunnyTargetId`, so the control names them — a sun with
  *Angela* under it — which is what stops a call being a thing you do to a name
  in a list. A nameless sun would not do. It is 44px in both layouts and nowhere
  near the draw pile in either.

  **It is small print, and the target is not** (#257). #189 was right that a
  20px circle was a missed tap and it overshot on presence: a window opens on
  **every draw**, which is most turns of most games, so a bold amber sentence was
  the widest thing over the felt almost continuously — for an action correctly
  used rarely. It is the app's ordinary grey at small-print size now, on a plain
  dark backing with no ring, and the 44px floor is untouched. Not amber: amber at
  this table means *the game is waiting on you* (#190), and this is not that.

  **It has stopped moving** (#329). It was drawn absolutely over the felt near
  your own cards — pinned right just above the hand upright, hung under the peek
  strip at its left end sideways — and a window opens on **every draw**, which is
  most turns of most games. So the one control whose window shuts when somebody
  else acts was the thing on the screen that flickered in and out at the edge of
  where your eyes already were, in a different place depending on which way up
  the phone was held. It is furniture now: **the header, top centre** upright,
  and **the peek strip's left cluster** sideways.

  Both homes satisfy #189's actual constraint, which is *away from the draw
  pile*, and which was written about the sun drawn immediately before the deck at
  the strip's right-hand end. The header is the full height of the column from
  the piles; the cluster is the far end of the same row from the deck, and is the
  only part of that row a control may take width from. So the sun being back on
  the strip is not #189 undone — the end it was taken off is still the end it may
  not go back to.

  Two consequences worth stating. **Its place in the header is reserved whether
  or not a window is open**, on a `flex-1` slot, so the four controls beside it
  do not reflow when one opens — the reasoning that keeps the `min-h-7` line
  above the hand clear (#131). And in the cluster it is drawn `inline`, glyph
  beside name rather than above it, so it reads as one line of small print like
  the fullscreen offer next to it: a stack there would spend the strip's height,
  and the strip spends height out of the hand. That is a layout, exactly as the
  side used to be. **Nothing about it varies with whether a call would land**, and
  nothing ever will.

  Only the offer moved. The missed-call count, which is yours alone, and the
  offer of help stay where they were.

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

  **Only the hand half is drawn, and the board half is the caller's to
  remember** (#318). `activeSuit` and `topRank` rode the wire from #74 with no
  reader anywhere in `packages/web` until #220 argued that a picker asking which
  card was legal while showing half of what legal is measured against was asking
  the question wrong, and #310 drew them as a `had to match ♠ or 5` chip. That
  is switched back off. **Calling the Sunny Rule is meant to cost something only
  memory can pay**: at a real table the card in play at the reach is buried
  under everything that has landed on it since, nobody deals it back out, and
  keeping track of the middle of the table is part of what makes a call a claim
  rather than a lookup.

  The failure case #220 was filed over is therefore back, and is now the
  intended difficulty rather than a bug: a caller who reads the *pile* instead of
  remembering the board will name the card that matches what is showing now, and
  after an 8 that is worse than a coin flip. The pile in front of you is not the
  board, because the window outlives the turn. A caller who has not kept track
  should not be calling.

  **`ReachBoard` is switched off, not deleted** — `SHOW_REACH_BOARD` in
  `SunnyAccusePicker.tsx`, one constant, with #220's argument and its own kept
  whole above it. This panel has now reversed twice (#31 → #50, #220/#310 →
  #318), so the arguments are worth more than the code. If a table ever gets the
  board back, it comes back as **two chips rather than one card**, and that is
  the constraint to hold: after an 8, `topRank` and `activeSuit` are the 8's rank
  and somebody else's suit, so a single `8♣` would print a card nobody played
  and the pile is not showing. `sunnyReach` carries no `Card` to draw instead
  and must not grow one. Wilds go unmentioned for the bullet's own reason — "or
  any 8" is true, harmless-looking, and points straight at cards in the hand.

  **The log is concealed while the picker is up, and that is the same rule
  enforced twice** (#319). The upright table draws every event in the game in
  words at the foot of the column, most recent first, so a caller who could
  scroll it would have the board written out for them and #318 would be a change
  of typography rather than of difficulty — and the *collapsed* line is the worst
  of it, being the most recent event, which after a reach is very often the play
  that changed the board. It keeps its space and says what it is doing: a box
  vanishing out of the column as you tap a control reads as a bug, and the cards
  above it must not move under a thumb (#131). The condition is
  `accusePickerOpen` in `lib/sunnyOffer.ts` — one predicate, because the picker
  and the concealment are the same moment. Nothing goes on the wire and no other
  screen changes; landscape has no log at all. **Back out of the picker and the
  log is there again**, which is deliberate: concealing it for the whole window
  a call could be made would conceal it for most of most games, since a window
  opens on every draw. What it buys is that the question and its answer are never
  on the screen together.
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

  **The marks carry no words** (#324). The two ringed cards wore `was in play`
  and `named` chips until then, and the pairing is the message: the whole of what
  the table does here is see whether they match, and for that a caption saying
  which is which is not doing work the marks and their places aren't. One is on
  the pile, which is where the board is; the other is held out beside it, which is
  where a card being claimed about is. The `sr-only` paragraph carries the
  narrative unchanged.

  **The ruling that follows it is a card and a word.** It was two sentences
  carrying four facts, the second of which spelled out a card this app draws
  everywhere else and turned a verdict into a sentence. Both beats are also
  longer than they were — `PEEL_MS` and `ANNOUNCE_MS` in `lib/beats.ts`, where
  they are because a call is watched on a phone and on the screen in the middle
  of the table and has to be the same length on both (#185).

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
- **A seat on autopilot never calls the Sunny Rule, and never could commit a
  violation either (#202).** A player can hand their seat over for a while —
  `forced`, which acts only when there is exactly one lawful thing to do, or
  `bot`, which decides as well.

  **The control asks two questions rather than offering three answers (#291).**
  *Stepping away?* is a yes/no and is drawn as one, on `TwoWay`; **Autoplay
  engages `forced`**, and a second switch, *Make decisions*, is what reaches
  `bot`. It appears only once Autoplay is on and it is off when Autoplay is
  engaged, so nothing is ever decided in somebody's name until they ask for it.
  The three modes and every message on the wire are untouched by any of that —
  it is the control, not the state behind it. Both run on the server with the bots, because
  the case worth having is a phone that has gone to sleep, and both go through
  `decideBotIntent`, which plays whenever it can. So an autopiloted seat can
  never reach for the deck holding a play: the property comes free and must stay
  free.

  **It does not accuse.** Bots call; an autopilot does not, because a wrong call
  is a three-draw lockout and taking that in somebody's name, out loud, at the
  table is not the same kind of act as playing their forced card. Others may
  still call *on* it — the rule does not care who moved the cards.

  **`forced` stops at every real choice**: naming a suit, and the punishment card
  after a landed call, which is a choice about which card to lose. The forced
  play in front of that card goes with it, because stopping at step 2 of 3 would
  be the same stall one beat later. A forced-only seat holding two legal cards
  can still hold the table up; that is inherent, the mark is what makes it
  visible, and the answer is that somebody shouts through the door.

  **It is public, and it is not the lobby's *away*.** A dropped socket is a
  different thing and it is recoverable. `SeatView.autopilot` is a standing mark
  in the seat strip, on the shared screen and in the lobby, for as long as it
  lasts — at a real table you can see somebody has gone, and it is also the
  explanation for a seat suddenly playing differently.

  **Nobody may set it for anybody else.** The server stamps the seat from the
  connection, exactly as it does for an intent, so a shared screen — which holds
  no `playerId` at all — and every other player are both out. Any intent from
  your own connection ends it, and so does the end of a game.
- **Leaving is a door and a question, and the question is not a formality
  (#255).** It was the word *leave*, small and grey, an inch after the word
  *rules* — two words the same size and colour, one of which opens a panel and
  one of which drops you out of the game — and it fired instantly. The dialog
  says what leaving actually costs, which is more than people expect: this
  browser throws away the token that proved the seat was yours, so **a leave is
  not a closed tab and cannot be undone**. Both answers name themselves; a bare
  Cancel/OK asks somebody to work out which is which while reading a sentence
  about losing their seat. The lobby keeps the *word*, because it is a screen
  with room, opposite **How to play**, with nothing running — but it asks the
  same question, since the token goes either way.

  **The lobby's seat-order check was the precedent cited here and is not one any
  more** (#316). Its dismissing answer is **Go back**, a direction rather than an
  answer to *does this look correct?*, so the pair there is asymmetric on
  purpose: that question is a glance at a list, and this one is a seat that
  cannot be handed back. The rule survives where the stakes are; do not read the
  lobby as a licence to relax it here.
- **A seat somebody has left keeps its cards and is played out (#256).** The
  obvious answer — delete the seat — is ruled out by the first invariant this
  game has: hands plus deck plus pile come to 52, and a seat with a hand in it
  is not deletable. So a leave mid-hand marks the seat `left`, hands it to the
  autopilot, and lets `beginGame` drop it at the next deal. Between games it
  simply goes.

  **A leave is not recoverable and a disconnection is**, and that distinction is
  the whole of why this was not a two-line fix. Before #256 the server could not
  tell them apart, because leaving was entirely client-side and all it ever saw
  was a closed socket. Rejoining with the token still has to work for a lock
  screen, a backgrounded tab and a dropped tunnel — which is also why
  `seat.connected` is cleared on snapshot load. A leave clears the token as well,
  because the browser has already thrown its copy away.

  It is told to the table as a `TableEvent`, which rides the same feed as
  `GameEvent` and is deliberately not one: the engine neither emits it nor reads
  it. Do not move it into `types.ts`.
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

**One cog with two rooms in it (#253), and they are two pages rather than two
halves of a column (#313).** Every seated player gets the same gear, top left, in
both layouts. It opens on **Your settings** — the hints toggle and the autopilot
(#202) — and for a host, and only a host, that page ends with a row through to
**Room settings**, with a way back where the row was and the same Done on both. A
non-host sees one page and no navigation at all: nothing naming a room they cannot
enter. A watcher gets no cog: the personal page is about cards they do not have
and the room page is not theirs.

**Which page you are on is not remembered.** Closing forgets it and the next open
lands on *yours* — the reasoning that took `goleta:table-view` out: a preference
the app would have to store to answer a question that is one tap to re-ask.

**Not `TwoWay`, and that is the obvious wrong turn.** A tab pair on that track
would put the panel's single loudest amber control on the one thing in here that
changes nothing, and `TwoWay` says in its own header what it is for: two answers
a person would *say*, to a question. *Which page am I looking at* is not a
setting. It is a label and a `›`, the shape `Rule` in `screens/Rules.tsx` already
uses for a drill, and a tab bar would be a third shape in a file that has exactly
two and says not to add one.

It was one scrolling column until #313, and scrolling was the wrong shape for it
twice over: the room half is where a host goes to change one thing and get back
to a hand that is still running, and the personal half's whole reason for
existing is *I am stepping away*, pressed by somebody who has already stopped
looking at the screen. Measured after the split: the personal page is 360px, 432
with the autopilot on, which is the tallest it gets and fits any phone held
upright. **The room page is about 736px and still scrolls on a short one**, and
that is accepted — five groups and a note do not fit however they are arranged.
The answer is the `overflow-y-auto` that is already there. **Do not add a third
page, and do not split the pages differently by height**: two navigation models
for one panel is worse than a scroll that engages on one device.

**Both pages are headed, and the headings have to look like the level above
the rows** (#289). That is the whole point of the division — a host seeing at a
glance which half changes the game for everybody — and it was drawn in the exact
five classes `DealerPicker`, `HouseRulesPicker`, `IrlToggle` and
`AutopilotPicker` each use for their own headings, so the panel came out as a
flat list of six identical ones. `SectionHeading` is bigger, brighter and not
uppercase; the sub-headings did not move. It is each page's title now rather
than a divider in a column, and there is one on screen at a time.

**The bar for the personal page is that it belongs to one player and changes
nothing about the room**, which rules out everything on the other one. That is
#188's rule, it is the part worth keeping verbatim, and it matters more now that
this is the page everybody lands on. What it does *not* mean is
private: the hints toggle is announced when it goes on and marks the seat for as
long as it lasts (#187), a seat on autopilot carries a standing mark for as long
as *that* lasts (#202), and sharing a roof with the host's settings must not
start implying otherwise.

It was two doors an inch apart until #253 — a gear and a person, on the argument
that two gears would not read as different things. That argument was sound and
the outcome was not: the personal door held exactly one control, that control is
also the last thing on the rules screen, and **rules** is a labelled word in the
same header. So the glyph nobody recognised led to the one setting everybody
could already reach by pressing a word that says what it is. The distinction
survives as two pages behind one cog.

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

A table has **two views, one brain**. The brain is `screens/table/useTableState
.ts` — the Sunny state machine, the stall timer, the assist, the sort — and
`Table.tsx` picks a layout from what it returns. `HandView` is the landscape
one: a peek strip, and the whole of the rest of the screen given to your hand.
Anything that needs table state belongs in the hook; the layouts are given what
to draw, in four bundles (`TableContext`, `HandControls`, `HelpControls`,
`SunnyControls`) rather than thirty loose props.

**The decisions are not in the brain either.** Which of the five screens you are
owed is `lib/tableRoute.ts`; what tapping one of your own cards does, and
whether the app is pointing at the answer, is `lib/handMode.ts`; the call window
and the caught dialog are `lib/sunnyOffer.ts`; counting finished games is
`lib/graduation.ts`. All four are pure, all four have tests, and that is the
point — nothing in this repo renders a React component in a test, so a decision
left inside a screen is a decision nothing checks. Put new ones there too.

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
- **The cog and the way back to the rules are the other two, and they are here
  because they were nowhere (#194, #195).** `HandView` has no header, so the cog
  the upright table draws in its own simply did not exist in landscape — and an
  IRL table *is* a table of phones held sideways, which is the whole point of
  that view. The rules had the same gap and it is
  the worse one: landscape is the IRL view, an IRL table is where the new
  players are, and looking a rule up is a thing that happens mid-hand.

  Both live in the **small-print cluster at the left**, which is the only part
  of that row allowed to wrap and therefore the only place a new control may
  take its width from. The right-hand end belongs to the card in play, the
  prompt and the deck, and the strip itself still never wraps.

  The cog is **44px in both layouts and the same shape in both** — it was a
  16px glyph in a 24px box, in a header of small grey print, and hosts did not
  find it. In the strip its target is painted out of a shorter row box, because
  the rule above it is that two lines of small print stay shorter than the pile
  card beside them, and what a full-height line would spend the difference out
  of is the hand. The rules link opens the same screen the upright header does,
  hints question and all — that was the *first-run* question when this was
  written, and #301 made it a standing preference the screen carries every time.
  Nothing pauses behind it: a challenge window can close while you read, exactly
  as it always could. **On a short screen the question is the last thing in the
  scroll rather than pinned under it** (#305) — #187 pinned it so the last
  decision before the first hand could never be below the fold, and in landscape
  the pin was costing the rules themselves about 160px of a 300px panel, which is
  burying the thing it was protecting.
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

### Where a new control goes

Placement, not logic, is what a change to these screens actually costs. The
constraints ruling out each candidate spot are individually well argued and
none of them should move — but they live in `HandView.tsx`, `PeekStrip.tsx`,
`Table.tsx` and this file, and had to be reassembled from scratch every time
somebody wanted to add one quiet line (#230).

This is a **map of decisions already taken**, so you can stop looking once you
have found your row. It is not a new rule and nothing in it may be cited as one;
the linked issue is the authority, and if this table and the code ever disagree
the code is right and this is stale.

**It is a starting point, not a reference, and it has already been wrong.** Two
rows contradicted each other for the whole of round two: the sun was listed at
the strip's right end, beside the draw pile, after #189 had moved it away from
exactly there — and an agent working on #257 reported that having to verify the
map against the components anyway was most of the saving gone (#262). So it is
hand-maintained and nothing enforces it. **The rule that keeps it honest is that
a control moving moves its row in the same PR**, and the check on that is
reading the two or three files a row names before trusting it — which is the
cost this map only partly removes.

**Landscape — `HandView`**

| Where | What is there now | Free? |
| --- | --- | --- |
| Peek strip, left cluster | the cog, rules, fullscreen offer, **the sun** (#329), sort, help offer, missed-call count | **Yes — this is the place.** The only part of the row allowed to wrap, so the only one a new control may take its width from. `PeekStrip.tsx` states the rule in full, once, on the cluster element. A control here is drawn as one line of small print — the sun takes its `inline` layout for that reason. |
| Peek strip, right end | the card in play, help asked for, prompt, draw pile | **No.** The pile has to stay reachable, and anything pushed off it wraps *the pile* onto a second row — a card's height off the hand. The sun is **not** here: #189 took it off *this end* precisely because it was drawn immediately before the deck, and #329 put it back on the strip at the other one. |
| Under the strip, left | — | **No.** The sun hung here from #189 until #329 moved it into the cluster; what has not changed is why it may not go near the deck at the other end — a fat target beside the pile is a mis-tap into the exact violation it accuses. |
| Under the strip, centred | **I'm done** (#260) | **No.** The same argument in reverse: it can now *commit* the offence, so it is kept away from the deck at the strip's right-hand end. |
| Bottom-left felt corner | the offer of help | **No** (#167). |
| Bottom-right felt corner | the sort control | **No** (#167). |
| Under the cards | — | **Never.** `handHeight` reads the room the row is left, so a line there is paid for in card size (#131). |

**Upright — `Table`**

| Where | What is there now | Free? |
| --- | --- | --- |
| Header row (`TableHeader`) | four icons with a word under each — settings, invite, rules, leave (#330, renamed in #353) — and **the sun**, centred, in a slot that is reserved whether or not a window is open (#329) | Yes, for a control rather than a table fact. A new item joins the four rather than being drawn some other way, and anything that comes and goes reserves its place. |
| Under the prompt | **I'm done** (#260) | **No.** A primary action, and the only thing the table is waiting for while it is up. Far from the piles above it. |
| The `min-h-7` line above the hand (`OwnHand`) | help link, missed-call notice, sort | Yes. Kept clear either way, so the hand does not move under a thumb when something appears. |
| Above the hand, right | — | Free since #329 took the sun to the header. The middle of that box is still where your own `HelpShout` rises; the right and left are open. |
| Top of the screen | the Sunny announcement | **Never.** It is the one thing at this table nobody may miss, which is exactly why a refused move answers against the hand instead (#99). |

**Shared table screen — `TableScreen`**

Nothing is stacked in a column and nothing may be: every piece is placed against
the design box, inside the bands reserved for seat names (#141), and no piece
gets a scale of its own (#159). Adding anything back into a flow is how the
overflow that pushed names through the edges returns.

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
- **It has exactly two auxiliary actions**, in the sense that matters: two
  things it can do that reach the server. It still joins as a watcher (#16), with
  a `table` bit on the watch message. (Opening the invite is not a third — it is
  a local panel over two links and a code, and it changes nothing about the
  room.) In an IRL room, while the game is waiting on an ordinary action, tapping
  its draw pile draws for the current player; and between games, a **name can be
  dragged to the edge its player is actually sitting at** (#201). It cannot play,
  name a suit, call Sunny, surrender or end a turn.

  **A name dragged round the edge is a seat moved in the order**, not a label
  repositioned: position on this board *is* seat order, and seat order is turn
  order (#186). The alternative was finding the host's phone and nudging names
  with arrows while looking at a different screen.

  **A seat carries where it sits** (#320). `SeatView.spot` is `[0, 1)` clockwise
  round the edge and `room.seats` is kept sorted by it, so the ring order *is*
  the array order and nothing downstream learns it exists — #186's clockwise walk
  is preserved by construction rather than by a spreading table. `edgeSeats`
  used to decide the arrangement outright, so a table with three people down one
  side could not say so and a drag could only pick which of six fixed marks a
  name occupied.

  A **drop sends one `placeSeat`** rather than the run of `moveSeat` hops it was:
  a drop is a place rather than a distance, turning it into hops means first
  asking which existing seat it landed nearest — a question about everybody else
  — and one message about one seat cannot arrive stale about anybody. Nobody else
  moves; a seat dropped between two others sits between them, and the gap it left
  stays open. `moveSeat` stays for the lobby's arrows, and swaps two neighbours'
  chairs.

  **A table nobody has arranged is re-spaced as it fills**, evenly round the
  circle in the order people sat down, and only then does a newcomer take the
  middle of the largest gap. That is not tidiness: without it an IRL-only feature
  would quietly reorder every *online* room, because the middle of the largest gap
  is not where join order puts somebody, and a host adding four bots would watch
  them come out in the wrong order. There is no flag to carry — a table that has
  been arranged is not evenly spaced, and that is the whole of the question.

  **The rung follows the arrangement, and spilling is a last resort.** A name is
  drawn on the edge its spot falls in; if that edge cannot hold it, the *type*
  steps down before anybody is pushed round a corner, because drawing somebody
  where they are not sitting is the thing this feature exists to stop. Only an
  arrangement no rung can draw honestly — four people down one side — spills, and
  it spills forwards, so ring order survives.

  **Not host-only, deliberately.** The arrows exist because a table wants its
  seating right, and the person who can see the room is whoever is standing next
  to the screen. **Between games only**, which the server enforces and which is
  doubly right here: this screen is propped in the middle of a table where
  somebody will put a drink down on it, so the gesture also has a travel
  threshold before it takes.

  The label keeps **its own angle while in flight** and settles into the new
  edge's on the drop — turning it mid-drag means re-aiming the thing under
  somebody's finger every frame, and where it lands is the question, not what
  angle it was read at on the way. The pointer is put back into design
  coordinates by `designPoint`, which is arithmetic rather than a matrix read off
  the DOM: the board's one transform is about its own centre, so the centre does
  not move.

  **The bit is the client's own word for what it is**, so it narrows rather than
  grants — any browser can send it, and the honest reading is that in an IRL
  room any watcher may draw for the seat on the clock, or reorder the seats
  between hands. That is why `irl` is the gate that matters and why it is checked
  on the server for both: an online room is strangers, and none of them get to
  move a stranger's hand or a stranger's table. In a room where the flag means
  what it says, everybody can already reach the propped-up screen with their
  actual hand. There is no identity to check here and there will not be one — see
  the note on logins under **Testing**.

  **A bot's turn is refused too.** The pile is drawn tappable to the whole room
  and a bot's turn goes past under a finger already on its way down, so without
  that check a tap lands on the bot — and a bot made to draw while holding a
  play has been handed a Sunny violation it never chose. Bots are decided and
  paced on the server for exactly that reason; nothing off a screen moves one.
- **It is drawn without `TableMotion`**, and it has its own flight layer (#200).
  `TableMotion` portals to the body, where the board's scaling cannot reach it,
  so cards would land at body coordinates. `TableFlights` lives *inside* the
  board's transform and aims in design pixels, which is what makes a flight
  survive the quarter turn and every scale without one of its own.

  **The planning is shared rather than written twice.** `motion/plan.ts` is pure
  and tested and already turns a batch of events into ordered flights — the deal
  the engine emits no events for, the hold a peel is entitled to, the recycle's
  nine face-down cards, the compression that stops a burst narrating a queue it
  has already left behind. All this screen replaces is the anchor resolution:
  `lib/tableFlight.ts` puts an `AnchorKey` in design coordinates instead of
  reading a DOM rect. Everything that changes place is seen changing place —
  draws, plays, the deal, turn-ups, recycles and the cards a landed call takes
  back.

  Four things about it. **A drawn card turns over at the deck before it travels**,
  which is what makes it read as a card coming off the deck rather than appearing
  from nowhere — and it is no leak, because every hand here is face up. **It
  flies off the edge rather than stopping at the name**: the hands are not on
  this screen, so there is nothing for it to land in. **Nothing waits for it** —
  no `dealing`, no gate on the prompt, and the draw pile stays tappable
  throughout. And **reduced motion plans no flights at all**, exactly as the
  phone does, with the board correct without them.

  A card back in the air divides `--paint-scale` out by the board's scale *and*
  the piles' fitting, multiplied by hand, for `ScaledPiles`' reason (#169): the
  lattice is a screen measurement and must not grow with the board.

  The peel is CSS on the pile and runs regardless, and it still goes first — the
  planner gives the rewind's cards the far side of `PEEL_MS` for free.
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
  four sides (`NameRung.band` in `tableEdges.ts`). The board used to be a
  `flex-col` whose children came to more than the height it had, and
  `justify-center` pushed the surplus out of both ends and through the names
  pinned to the edges. Adding anything back into a flow is how that returns.

  **The names are as big as the ring has room for, and the ring is measured
  rather than written down** (#320). They were `text-2xl` in `text-white/60` on a
  `bg-felt-950/40` pill — a phone's type size and a phone's contrast, on the one
  surface in this app read from the far side of a table, over the shoulders of the
  people sitting at it. The colour is lifted at every size, because that costs
  nothing; the size is a **ladder chosen from the seat count**.

  The places used to be four tables of fixed percentages, which worked only while
  every name was the same small size — `24%`/`76%` along the top is a sentence
  about a 216px label and says nothing about a 300px one. Each edge is now handed
  the span it may use, the label's length comes off both ends, and what is left is
  shared out. So a rung is a handful of numbers rather than four tables, and what
  the tests hold — nothing overlaps anything, at every count from four to eight —
  is the arithmetic itself rather than a coincidence between constants.

  **What decides the rung is the side edges.** Seven and eight seats put two
  names down one 560-pixel side less two bands, where two big labels do not fit;
  four to six put at most one. So four to six take the large rung and a full table
  keeps the board it already had, to the pixel. That is the honest answer rather
  than a failure — a name too small to read is the thing this was fixing arriving
  by another route — and it means a full table pays for its own crowding instead
  of a table of four paying for it.

  **The large rung is paid for twice over, and both are deliberate.** The prompt
  comes down from 512 to 360, because the bottom names sit in the flanks either
  side of it and the two are trading against one number; and the deeper bands cost
  the centre piles about a tenth through `pileBox` and `fitScale`.
  `pileBox.test.ts` holds that ratio, so a rung that got greedier would have to
  argue with a test rather than quietly shrink the middle of the table.

  **`facingTurn` reads the edge, not the point.** It used to ask which half of the
  board a seat's point fell in, which gave the side seats an answer only because
  they sat exactly on the midline — and they stopped doing that the moment the
  places were computed, because the bottom band is deeper than the top one. A
  pixel of asymmetry turned both side names upside down.

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

  **The folders are a one-way street and there are no import cycles.** `lib` is
  a leaf: pure logic and the hooks over it, depending on nothing but the engine.
  `net` and `components` may reach into `lib`, `motion` may reach into `lib` and
  `components`, and `screens` may reach into all of them. Three cycles existed
  until #224 and every one of them came from a pure value parked inside a module
  that renders or connects — card geometry inside a component, the moment
  durations inside the flight planner, the log's shape inside the socket hook.
  If something pure is wanted by two folders, it belongs in `lib`, not in
  whichever one wrote it first.

  **The stack is named once, in `lib/layers.ts`, and nothing `fixed` to the
  viewport may carry a bare `z-…` (#297).** The numbers exist to be compared, so
  they have to live where they can be: they were one per component, scattered
  over eleven files, with a comment in `Leave.tsx` claiming `z-30` was "like
  every other overlay here" that was already only half true. `FlightLayer`
  portals to `document.body`, which makes it the last child of the page, and it
  was `z-50` — the same rung as the settings dialog and the invite, which a tie
  hands to whoever comes last in the DOM. So a card drawn, played or dealt
  underneath an open panel flew across the front of it, and bots keep moving
  under a dialog by design, so that was most of what happened while somebody read
  the settings.

  **Cards fly over the table and under everything laid on top of it**, which is
  why `flights` has a rung of its own between the glow and the panels. The
  `z-10`s and `z-20`s inside components order things within their own positioned
  parent and are deliberately **not** on the list — putting them there would
  imply they compete with these, and they cannot. Neither is the shared table
  screen: `TableFlights` lives inside the board's transform and is ordered
  against the board's own pieces (#200).

  **The rules screen is drawn over the table rather than instead of it (#360),
  and that is a mounting decision before it is a stacking one.** `App.tsx` used
  to swap the whole table out for it, so every `useState` in `useTableState`
  meaning "this phone has already been shown that" was thrown away on the way
  back: closing the rules mid-hand put the "take your seat" list and the rotate
  prompt up again, both of them once-per-deal promises. #357 was the same cause
  with a different symptom, and so is the next such flag anybody adds. The
  consequence to know about is that the table is **live** behind the panel — a
  hints toggle flipped in there is announced when it is flipped, and a Sunny
  ruling draws over the reader rather than waiting to be replayed. `LAYER.reading`
  carries why that rung sits above the cards and below everything that announces.

**`packages/engine/src/redact.ts` is the security boundary.** Nothing outside it
decides what a client may see. Hands are not what it guards — every hand is face
up — but `state.challenge`, `state.sunny` and the deck are, and there is a test
that serialises a redacted payload and asserts none of them appear anywhere in
it. Any new field on the game state has to be considered there, and it defaults
to *not* being sent.

### File size is not this repo's cost driver, and that was measured

This one reads as an oversight and is the reverse of one. There are files here
well over five hundred lines, and splitting one is the first thing a fresh pair
of eyes reaches for. It was tried, four times, and it did nothing. **Do not
split a file because it is large, and do not expect a split to pay for itself.**

One real change from this backlog (#220) was made by a fresh agent on four
different trees, from a byte-identical prompt each time:

| Tree | Tokens | Tools | Secs |
| --- | ---: | ---: | ---: |
| before any of it | 106,518 | 34 | 376 |
| `Table.tsx` 1,016 → 355, split by state/render | 118,414 | 42 | 447 |
| rationale consolidated, import cycles fixed | 109,592 | 33 | 359 |
| `Sunny.tsx` 677 → seven files, split by component | 106,196 | 38 | 363 |

**Net across the whole programme: −0.3% tokens.** Both shapes of split were
tried — one cohesive file cut along its seam, one file holding eight unrelated
things — and neither moved the total. The cohesive split made it *worse* by 11%,
because a change needing both halves then read both halves.

Every arm named a costliest file. It was never the same one twice and never one
the previous step had just fixed: `Table.tsx` → `Sunny.tsx` and `PeekStrip.tsx`
→ `Sunny.tsx` → `HandView.tsx`, the last of which was named for a question it
changed nothing to answer. The complaint relocates and the total stays put,
because what costs here is assembling **interlocking domain constraints** rather
than finding code, and that does not get cheaper when the constraints are spread
over more files.

Two things this does not claim. Splitting for **cohesion** — one file doing two
genuinely unrelated jobs — is ordinary good practice, and #234 was a reasonable
change on its own terms; what is ruled out is splitting on a line count and
expecting the next change to be cheaper for it. And the programme bought real
things no token count shows: 490 tests against 391, a DAG the build enforces
instead of a claim in a commit message, and rationale stated once.

The reusable lesson is the mis-step at the front of it. **`Table.tsx` was chosen
as the target because 48 of 233 commits had touched it, and historical churn did
not predict where the work actually was** — of the nine issues open at the time,
none was squarely in it. If cost is attacked again, attack what every arm
actually complained about: constraints living far from the code they constrain
(#235), and facts that live only in prose (#236).

The evidence is `bench/results.md` in full, the protocol for adding to it is
`bench/README.md`, and `REFACTOR_FINDINGS.md` and `REFACTOR_PLAN.md` carry what
was concluded. Read them before re-deriving any of this from first principles,
which is exactly how it came to be run the first time.

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
