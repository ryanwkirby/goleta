# The wire protocol

One WebSocket per browser at `/ws`, JSON in both directions. The message types
are defined in `packages/engine/src/protocol.ts` and shared by both sides, so
this document describes the conversation rather than the shapes.

## The shape of it

The server is the referee. A browser never decides anything — it sends an
**intent** ("I play the 5 of hearts") and waits. The server runs the intent
through the engine, and if it's legal, pushes a fresh **state** to everyone at
the table, along with the **events** that produced it.

State is pushed whole rather than as a patch. A game is small enough that this
is cheaper than being clever, and it means a client can never drift out of sync
with the referee. The events are for the log and the animations, not for
reconstructing state.

**Every recipient gets different bytes.** Redaction runs per player, so the
message you receive is not the message the person next to you receives, even
though it describes the same moment.

## Identity, without accounts

There are no logins. On `create` or `join` the server replies `welcome` with a
`playerId` and a secret `token`. The browser keeps both in `localStorage` under
the room code.

`rejoin` presents them again to reclaim the same seat, which is what makes a
reload, a dropped connection, a phone locking itself, or a server redeploy all
recoverable. The token is the only thing standing between a stranger and
someone else's hand, so it is never broadcast — it goes to the one browser that
owns the seat and nowhere else.

`watch` joins with no seat at all: a table screen or a spectator sees the board
and holds no cards. Ordinary watchers can't act, and can't call the Sunny Rule.
A shared table screen sends the same message with `table: true`; in an IRL room
that one bit permits only tapping the draw pile for the current player.

That bit is **self-declared, and worth reading as such.** Any browser can send
it, so it narrows what one screen offers rather than granting anything a client
couldn't already ask for — which makes `irl` the real gate. An online room is
strangers and refuses the draw outright; an IRL room is people who can all reach
the propped-up screen anyway. The server also refuses it when the seat on the
clock is a bot, because a bot made to draw while holding a play has been handed
a Sunny violation it never chose.

**A watcher has no identity and writes nothing.** There is no `playerId`, no
token, and nothing in `localStorage` — so there is also nothing to reclaim. A
reload just watches again, and so does a reconnection after a dropped socket or
a redeploy: the client re-sends `watch` on every connection rather than only the
first, because watching is stateless and there is nothing to check.

Two client entry points reach it. They both watch, but the table URL identifies
itself on the watch message so the server can allow the draw-only shared-screen
action:

| URL | What it is |
| --- | --- |
| `#/r/ABCD/watch` | A person watching the table. |
| `#/r/ABCD/table` | A shared screen for the middle of an IRL table. |

The mode is in the URL rather than in a message on purpose: a device propped in
the middle of a table is opened once and left there, and "what this screen is
for" has to survive a reload without anybody touching it.

There is one more way in. `join` is refused for the length of a game, and that
refusal carries `code: "gameUnderWay"` alongside its sentence — so somebody who
has just pointed a camera at a table mid-hand is offered the watch URL instead
of being left on a form that will keep failing. It is the only error code there
is, and the bar for a second one is that reading the prose would otherwise be
the only way to tell.

### Refusals come in two weights

A refused `intent` carries `kind: "move"`; every other refusal carries nothing
and is a `session`. The distinction is how long the news is worth looking at, and
it is the only thing the client does differently with them (#90).

A **move** is a mis-tap — a card that doesn't match, a turn that isn't yours.
The hand it was aimed at already says so by not changing, so the words only name
which of the handful of reasons it was. They land in a pill hung off the top
edge of your own cards, fade in, and are gone in under two seconds with nothing
to dismiss. That is why the engine's refusals are three-word fragments:
`Doesn't match`, `Not your turn`, `That's three draws`. A **session** refusal —
the room is full, the seat isn't yours any more, that game is already under way
— is something to be read and acted on, so it keeps the panel at the top of the
screen, five seconds and an ✕. `Join` latches the refused room code off the back
of that, which a refusal that flashed past would take away with it.

Both are drawn on the same surface with the same sign, so **every refusal is
written the same way**, whichever side of the wire it comes from: sentence case,
no full stop. Two of them sitting in the same typeface an inch apart, one
capitalised and one not, is the first thing anybody would notice.

The server reads the kind off the message that caused it rather than off the
error, because the branch that sends refusals already has the client's message
in front of it — the alternative is a class hierarchy for one bit.

## Client to server

| Message | Who | Notes |
| --- | --- | --- |
| `create` | anyone | Makes a room, seats you, makes you host. |
| `join` | anyone | By room code. Refused once a game is under way, with `code: "gameUnderWay"` so the client can offer to watch. |
| `rejoin` | seat owner | `playerId` + `token`. |
| `watch` | anyone | No seat and no cards. `table: true` marks the shared IRL table screen. |
| `intent` | seated, plus shared table draw | `playCard`, `drawCard`, `chooseSuit`, `callSunny`, `surrenderCard`. A `table: true` watcher may send only `drawCard`, only in IRL mode, and the server stamps it as the current player. |
| `start` | host | Needs at least 4 seats, at most 8; bots count. Deals, and passes the deal one seat on from last round — or draws for it, if the table has asked for that. |
| `addBot` / `removeSeat` | host | Between games only. |
| `moveSeat` | host | Between games only. Moves one seat one place `up` or `down` the table order, which is the turn order — the pair trade chairs. Off either end does nothing rather than refusing. The lobby's drag handle sends a run of these — one per place — rather than a whole order; see below. |
| `placeSeat` | shared screen, IRL room | Between games only. Puts one seat at `spot`, `[0, 1)` clockwise round the edge of the board (#320). Nobody else moves. A phone is refused: dragging a name round the board is a gesture that only exists on that screen. |
| `setBotSpeed` | host | Between games only. `human` or `lightning`; carried back to everyone on `RoomView`. |
| `setHouseRules` | host | Between games only. The three toggles; carried back to everyone on `RoomView`. |
| `setIrl` | host | **Any time, including mid-game.** "Real life" rather than "remote play"; carried back to everyone on `RoomView`. |
| `setDealerMode` | host | **Any time, including mid-game**, for the same reason as `setHouseRules`. `rotate` or `random`; carried back to everyone on `RoomView`. |
| `setShuffleSeats` | host | **Any time, including mid-game**, same reason again. Whether the seats are reshuffled at each deal; carried back to everyone on `RoomView`. |
| `composingCall` | seated | "The picker is open" / "it isn't". Holds the bots while a call is being named. Answered with nothing and broadcast to nobody. |
| `help` | seated | "I'm stuck." Echoed to the whole table as a `shout`. Rate limited to one every 2s and silently dropped above that — an error banner is no answer to somebody asking for help. |
| `setHints` | seated | "Mark up my playable cards" / "stop". Yours alone, host or not, mid-game included. Sets `SeatView.hinted` for everyone; shouted only when it turns *on*. |
| `setAutopilot` | seated | "Play for me for a bit" (#202). `off`, `forced` or `bot`. Yours alone — the server stamps the seat from the connection, so nobody can set it for anybody else. Sets `SeatView.autopilot` for everyone. |
| `leave` | seated | "I'm going" (#256). Mid-hand the seat keeps its cards and the autopilot plays them out; between games it goes. Not recoverable — the token is cleared. |
| `ping` | anyone | Answered with `pong`. |

**The `playerId` inside an `intent` is ignored.** The server stamps the seat the
connection actually belongs to before the intent reaches the engine, so a client
can only ever act as itself. There's a test that tries it the other way.

## Server to client

- `welcome` — `playerId` and `token` for this browser (both null for a watcher).
- `state` — the room, your view of the game, and the events that just happened.
- `shout` — somebody said something out loud. Not a game event: the position
  doesn't change, it isn't replayed, it isn't in the log, and it goes out
  identically to everyone. Only `help` so far.
- `error` — a short human-readable refusal, on one refusal a `code`, and on a
  refused `intent` a `kind: "move"`. Rejected moves are ordinary; the engine's
  refusals are written to be shown to a player as-is, which is why they are
  fragments rather than sentences — see below.
- `pong`.

## What the server never sends

- The `challenge` object itself, which carries a full snapshot of the game and
  therefore of every hand as it stood a moment ago.
- The contents of the deck, including the cards a Sunny call is about to turn
  up off it.

Hands are not on that list: every hand is face up, so `state` carries all of
them and `events` go out whole, the same bytes to everybody seated.

Whether a draw was actually illegal is not on that list because it is not on any
list: no field carries it. `challenge.violation` stays on the server, and
nothing is derived from it on the way out. Two things *are* derived from the
challenge — `sunnyReach` while the window is open, and `sunnyCalled.evidence`
once a call has been judged — and neither reads `violation`.

### What it does send about the challenge window

Four fields, none of which is the answer.

`sunnyCallable` is true after **any** draw by somebody else, honest or not — the
call is always available, so its presence tells you nothing. `sunnyTargetId`
names who it would land on.

`sunnyReach` is the material for an accusation: the offender's hand and the
board they faced, frozen at the instant before the draw being challenged. A call
has to name one of those cards, so a caller has to be able to see them. Nothing
in it says which was legal — that is the judgement being asked for, and it is
made from cards that were face up on the table anyway. It goes only to viewers
who could call this instant: never to the drawer, who is not told they've been
caught, and never to a spectator, who has no call to make.

`sunnyLockedDraws` is how many draws you personally have left to serve after a
call that missed. It is about you and nobody else, so it goes to you and nobody
else.

An earlier revision (#31) did send the answer, as `sunnyWouldLand`, behind a
ten-second glow. #50 removed it: requiring the caller to name a card makes a
wrong call specific enough to stand on its own, so the tell was no longer
buying anything.

### What a judged call sends, on the event

`sunnyCalled` carries `evidence`: the card that was in play at the reach, the
suit that had to be matched then, and the cards that have landed on the pile
since. It is what the table peels the pile back to, so the ruling can be read
off two cards rather than taken on faith (#63).

It rides on the event rather than on `GameView` deliberately. Events describe
things that happened in the open and are broadcast whole, which is exactly what
a judged call is; hanging it there keeps it transient, keeps it out of the
persisted shape, and leaves the rule that `state.challenge` never leaves the
server intact everywhere else. It also reaches the offender and spectators,
which is right — once a call has been judged, everyone is told.

It is a purpose-built payload, derived on the way out. The snapshot it could
have been lifted from is an entire `GameState`, and it stays where it is. Every
card in `evidence` went face up in front of the table when it was played, so
none of it is a disclosure; nothing from the deck is reachable through it, and
there is no version of it for a window still open.

## House rules

`RoomView.houseRules` carries what the table is playing: `sunny` (a boolean),
`eights` and `seedEight`. The host changes them with `{ t: "setHouseRules",
rules }`, **at any time, a game in progress included** — unlike bot speed, which
is still refused while one is running.

The difference is when each is read. Bot pace is read live, every time a bot is
scheduled, so changing it mid-game moves a challenge window somebody is already
watching. House rules are read exactly once, at the deal, and the game keeps its
own copy from that moment — so what the host is editing is always the *next*
game, and a hand already out cannot be reached from here. That is what the
settings cog behind the table is for (#134); the panel says so in as many words,
because a control whose effect is invisible until the next deal has to admit it.

The message is deliberately not `GameOptions`. The engine's options also carry
a deck count and a starting hand size, and those are never accepted from a
client: the server validates the three toggles against their permitted values
and constructs the full options itself. A rule that isn't named in `HouseRules`
cannot be reached from a browser.

With `sunny` off, the three challenge-window fields above are inert for
everyone — `sunnyCallable` false, `sunnyReach` null, `sunnyLockedDraws` zero —
because no challenge window is ever opened in the first place.

## Playing with the highlights on

`SeatView.hinted` says a seat is having its playable cards marked up. The seat
sets it with `{ t: "setHints", on }` — its own message, host or not, mid-game
included, because it changes one screen and nothing about the room.

**Presentation, never a rule.** `packages/engine` does not learn it exists, it
is not on `GameOptions` or `HouseRules`, and it sits beside `irl` in spirit.
Every hand is already face up; nothing about this changes what is legal.

It goes to the whole table on purpose, and that is the whole bargain of #33:
help is always available and taking it is never quiet. A silent permanent toggle
would let one player stop being catchable without anybody else being able to
tell, which is the Sunny Rule switched off for one seat. So:

- **Switching it on is announced**, as `{ t: "shout", kind: "hints" }`, the same
  way `help` is.
- **The seat carries a standing mark** for as long as it lasts — in the phone's
  seat strip and on the shared table screen.
- **Switching it off is silent.** Giving up an advantage is not something the
  table has to be told.

`setHints` returns whether it turned the mark *on*, and only that case is
shouted. A browser re-asserting its own preference after a reconnect is
therefore silent, which is what makes the client safe to sync whenever the two
disagree. The durable copy of the preference is the browser's `localStorage` —
there are still no accounts anywhere — and the seat flag is the room's copy, so
that the table can see it.

The room snapshot gained the field, so `SNAPSHOT_VERSION` went up again.

## Playing your seat while you are away

`SeatView.autopilot` is `off`, `forced` or `bot`, and the seat sets it with
`{ t: "setAutopilot", mode }` (#202). Somebody gets up for a drink and the table
waits; this is how a seat says *carry on without me* without leaving the room
and losing the seat.

**It runs on the server, with the bots**, which is the whole point: an autopilot
driven from a browser would be a phone in somebody's pocket playing cards,
including while that phone is asleep, which is exactly when this is wanted. So
it survives a disconnect, and it is room state — `SNAPSHOT_VERSION` went up
again.

**`packages/engine` does not learn it exists.** `decideBotIntent` already decides
a move for a seat and does not care whether there is a person behind it;
`forced` is a narrowing applied on the server to the same redacted `GameView`
everybody else gets.

What it will not do is the design:

- **It cannot commit a Sunny violation the player did not choose.** It plays
  whenever it can, so it never reaches for the deck holding a play. Free, and
  the most important property here.
- **It never calls the Sunny Rule**, in either mode. Bots do; a wrong call is a
  three-draw lockout, and taking that in somebody's name, out loud, at the table
  is not the same kind of act as playing their forced card. Others may still
  call *on* an autopiloted seat — the rule does not care who moved the cards,
  and in practice there will be nothing to catch.
- **`forced` means genuinely forced**: exactly one legal card, or none and a
  draw. It names no suit and picks no punishment card, both being choices — and
  the forced play in front of the punishment card goes with them, since stopping
  at step 2 of 3 would be the same stall one beat later. A forced-only seat can
  still hold the table up when it has two legal cards; that is inherent, and the
  mark on the seat is what makes it visible.

**Public and standing.** At a real table you can see somebody has gone. The mark
is its own word rather than the lobby's *away*, which is a dropped socket — a
different thing, and recoverable.

**Ending it.** Any `intent` from your own connection turns it off, after the move
rather than before, so a refused mis-tap is not what hands your seat back to you
from across the room. The cog turns it off explicitly too, and it clears itself
when a game ends: a new deal is a new hand. Nothing else may end it and nothing
else may start it — a shared screen holds no `playerId`, and another player's
connection stamps their own seat.

Pacing is the table's, not the seat's: an autopiloted seat is scheduled through
the same `botPace` as everyone else's bots, so it moves at the pace the room is
set to.

## Reordering the table from the shared screen

The shared table screen's second auxiliary action (#201). In an **IRL** room,
**between games**, a **drop** sends one `placeSeat` — where that seat now is,
`[0, 1)` clockwise round the edge of the board (#320).

Position on that board *is* seat order, and seat order is turn order, so a name
dragged round the edge is a seat moved. There is no separate "where the name is
drawn" to change.

**A drop is a place rather than a distance**, which is why it is not the run of
`moveSeat` hops it was until #320. Turning a drop into hops means first working
out which existing seat it landed nearest — a question about everybody else —
and then posting a number of moves that is only right if nobody moved in
between. `placeSeat` says one thing about one seat: it cannot be stale about
anybody, and nobody else moves. A seat dropped between two others simply sits
between them, and the gap it left stays open — at a real table nobody shuffles
up.

It is still not an `order: PlayerId[]`, for the reason it never was: a whole
posted order can arrive after a seat has left, and a stale permutation is a worse
thing to reconcile than one seat that has moved.

`moveSeat` from this screen stays. It is what the lobby's arrows send, it is the
right shape for a nudge of one place, and a screen built before #320 has no
reason to stop working.

**`spot` is on `SeatView` and `room.seats` is kept sorted by it**, so the ring
order *is* the array order and nothing downstream learns any of this exists.
Everything that already moved seats keeps working by moving spots: `moveSeat`
swaps two neighbours' chairs, a joiner takes a free one, a leaver leaves a gap,
and `shuffleSeats` permutes the *players* across the chairs that are already
there — the chairs stay where they are and who sits in them changes, which is
what the "take your seat" screen is already telling everybody (#199).

**A table nobody has arranged is simply re-spaced as it fills**, evenly round the
circle in the order people sat down. Without that, a joiner taking the middle of
the largest gap would reorder an *online* room — a host adding four bots would
watch them appear in the wrong order for a reason to do with a board they are not
using. The gap rule takes over the moment somebody has dragged a name, and there
is no extra state to carry: a table that has been arranged is not evenly spaced,
and that is the whole of the question.

The gate is the same as the draw's and works the same way. The `table` bit is the
client's own word for what it is, so it narrows rather than grants; **`irl` is
what holds the line and is checked on the server**. An online room refuses it
outright, exactly as it refuses the draw. It is deliberately **not host-only**:
the arrows exist because a table wants its seating right, and the person who can
see the room is whoever is standing next to the screen.

## Ending a turn

`endTurn` is an intent like any other (#260). The turn used to end itself after a
third fruitless draw, which shut the challenge window on the reach that had just
opened it — the next seat was on the clock the instant the third card landed.

It is **refused unless the turn has actually been drawn out**: three draws, or a
deck that cannot be replenished. There is no legal way to end a turn you have not
drawn out, and none at all on somebody else's. `GameView.canEndTurn` carries that
one condition to the browser and to the bots, so nothing re-derives it — and it
**says nothing about your cards**, being exactly as true when the third draw
handed you a play as when it left you stuck.

**Pressing it while holding a play is permitted silently**, and is a Sunny
violation recorded like a reach for the deck. It is judged against the board and
the hand at the moment it was pressed, not at the draw: the three draws may have
been perfectly honest, and it is the card the third one *gave* them that makes
ending the turn an offence. A violation already frozen from an earlier draw stays
frozen — that is the first offence.

It does not touch `totalDraws`, because a lockout is measured in draws at the
table and this is not one.

The **shared table screen cannot send it.** Its one auxiliary action stays
`drawCard`, for the reason the bot check there exists: a screen in the middle of
a table handing somebody a violation they never chose is precisely the case being
guarded against.

## Leaving, as opposed to dropping off

Leaving used to be entirely client-side: the browser forgot its token and
reloaded, and all the server ever saw was a socket closing — which is also what
a lock screen looks like. So the turn could reach a seat nobody would ever move
again and stay there forever, with no message on any screen saying what had
happened and no way for the host to deal a new hand (#256).

`{ t: "leave" }` says it out loud. What happens next depends on whether a hand
is out:

- **Between games** the seat is simply removed. It holds no cards.
- **Mid-hand it cannot be**, because card conservation — hands plus deck plus
  pile come to 52 — is the first invariant this game has. So `SeatView.left` goes
  up, the seat's `autopilot` is set to `bot`, and the hand is played out (#202).
  Turn order is untouched, the engine learns nothing, and `beginGame` drops the
  seat at the next deal.

**A disconnection is still recoverable and a leave is not**, which is the
distinction the server could not draw before. `markDisconnected` is unchanged: a
lock screen, a backgrounded tab and a dropped tunnel are one thing, and
`seat.connected` is cleared on snapshot load for the same reason. A leave clears
the seat's token and sets `left`, and `rejoinRoom` refuses on either.

The table is told with a `TableEvent` — `{ type: "left", playerId }` — which
rides the same feed as `GameEvent` because the log is one list of what has
happened, but is deliberately **not** a `GameEvent`: the engine neither emits it
nor reads it, and no rule turns on it. The bar for another is that it changes who
is at the table without changing the position. `isGameEvent` is how the places
that plan card movement filter them back out.

## Who deals

`RoomView.dealerMode` is `rotate` or `random`, and the host sets it with
`{ t: "setDealerMode", mode }`. It defaults to `rotate`, which is the
convention and is exactly what every table did before the setting existed.

**Not a house rule, and deliberately not on `HouseRules`.** `startGame` takes a
`dealerIndex` and knows nothing about how it was chosen: rotation is a
`rooms.ts` convention rather than a rule of the game, and `docs/RULES.md` says
dealing is all the dealer does. So it sits beside `irl` and `botSpeed` as a
property of the room, and `packages/engine` never learns it exists. `HouseRules`
stays the three written alternates and nothing else.

It is read once, at `beginGame`, which is why it is **not** frozen mid-game —
the same argument as the house rules, and the opposite of bot speed, which is
read live. What a host changes mid-hand is always the next deal.

What the dealer decides is two real things, which is why the setting is worth
having: **who opens**, since the player to the dealer's left goes first and
going first is not nothing in a game where playing is compulsory; and **the
seeded 8** under Dealer's Choice, which is the one advantage dealing carries.

A random draw may land on the same seat twice running. That is the honest
answer for a random pick, and a table that finds it annoying is describing
rotation. The randomness is the server's own, from the same source as room codes
and seeds — `packages/engine` keeps its no-`Math.random()` rule untouched.

The room snapshot gained a field for it, so `SNAPSHOT_VERSION` went up and older
snapshots are discarded on boot. No migration; see `AGENTS.md`.

## Shuffled seats

`RoomView.shuffleSeats` says the table reorders itself at each deal. The host
sets it with `{ t: "setShuffleSeats", on }`, off by default, and — like
`dealerMode` and the house rules — it is read once at `beginGame`, so what a
host changes mid-hand is always the next deal.

**Seat order is turn order, so this is not cosmetic.** It changes who follows
whom, which is the point: without it, whoever is on your left is on your left
all evening, and you spend every hand deciding against the same person and
handing to the same person.

`beginGame` shuffles `room.seats` before anything reads the order, using the
engine's Fisher-Yates on a seed the server has just generated — the randomness
is the server's, and `packages/engine` never learns the list it is handed came
out of a hat. The shuffle goes **first** so the deal is passed in the new order:
`nextDealerIndex` looks the last dealer up by id, so the seat that dealt is
found wherever it has landed and the deal moves one along from there. That is
what "the dealer is not lost across a shuffle" means — the person is tracked,
and only their neighbours change.

It is independent of `dealerMode`: that one changes who deals, this one changes
who follows whom. With both on the shuffle largely subsumes the rotation, which
reads sensibly rather than needing them made exclusive.

**The IRL half is the actual feature.** `gameStarted` carries `seatsShuffled`,
and an IRL room answers it with a "take your seat" screen: the new order,
numbered, with your own seat called out, shown to every phone before it draws
the table. A setting that reshuffled turn order every hand and said nothing
would undo everything the lobby does to make turn order and physical order
agree — the app would deal across the table and back, and it would be three
turns before anybody noticed. Online rooms just deal in the new order; there is
nobody to move.

Nothing pauses behind that screen, the same deal `RotatePanel` has: the cards
are already dealt and this cannot hold a deal open. It is dismissed by hand
rather than on a timer, by each phone for itself, because people have to get up
and move and a countdown is the wrong pressure for that.

`SNAPSHOT_VERSION` went up again for the new room field.

## IRL mode

`RoomView.irl` says this table is sitting in the same room, each holding their
own phone. The host sets it with `{ t: "setIrl", on }`, and it defaults to off,
so an online room behaves exactly as it did before the flag existed.

**It is not a house rule, and deliberately not on `HouseRules`.** Everything
there changes what is legal, is mapped onto `GameOptions`, and reaches
`applyIntent`. This changes nothing the engine can see: it is presentation, and
putting it on the rules path would hand the engine an input it must ignore and a
`GameOptions` field that means nothing to a simulation. It belongs beside
`botSpeed` — a property of the room.

**Bot speed is the only host setting frozen mid-game**, because changing the
pace moves a challenge window somebody may already be watching. Nothing like
that applies to this one: no timer reads it, no legality turns on it, and the
server does no more than copy it to every client — so a table that gets three
turns in and realises they are all sat together can flip it there and then. It
takes effect on the tap, which is the other half of what the cog's panel has to
make clear: house rules beside it wait for the next deal, and this does not.

It is room state, so it is in the snapshot and survives a redeploy.

**Seat order is turn order, and `moveSeat` is not gated on `irl`.** Online the
order is arbitrary and nobody has a reason to care; a table sitting in one room
has a physical order for it to disagree with, and a game that deals across the
table and back gets noticed three turns in. Which rooms are worth showing the
arrows in is a presentation call and stays in the lobby — the wire refuses only
what it always refused, a non-host and a game in progress. Gating it on a flag
the host can flip at any moment would throw an error at somebody mid-shuffle for
changing an unrelated setting.

**One place at a time, rather than a whole `order: PlayerId[]`.** An order
posted from a browser can arrive after a seat has left, and a stale permutation
is a worse thing to reconcile than a swap that no longer applies. The lobby's
drag handle (#197) is built on top of that rather than around it: a drop three
places up sends three `moveSeat` messages, each independently valid, each
applied or refused on its own merits. Nothing about a drag reaches the wire that
an arrow tap could not have sent.

That is also what makes a list changing mid-drag safe. A hop is relative to
wherever the server currently has that seat, so the worst a stale index can do
is send the wrong *number* of hops — a name one place out, on screen, fixable
with the arrows. It can never post an order built from a table that has moved
on. `lib/seatDrag.ts` holds the arithmetic and `test/seatDrag.test.ts` holds the
equivalence.

## Bots

Bots live on the server and act on a timer, at one of two paces the host picks
in the lobby. The setting belongs to the room, not to a viewer — one timer feeds
every screen at the table.

| | first action of a turn | the rest of that turn | calling Sunny |
| --- | --- | --- | --- |
| `human` (default) | 3s | 1s | 5s |
| `lightning` | 700ms | 700ms | 700ms |

The first two columns are the whole of a bot's turn pacing. It pauses once, to
read as thinking, and then gets on with the rest — the second and third draws of
a stuck turn, and the suit named after playing an 8, are decisions it has
effectively already made, and sitting on those reads as lag.

**An open challenge window changes none of these figures.** A window opens on
every draw, so a bot that waited on one would spend most of the game waiting;
the bot that just drew would be holding the table still on the chance that
somebody accuses it. Bots move at their own pace and windows close when they
close. Whether a call is available is not an input to the pacing at all.

`calling Sunny` is the one Sunny figure left, and it is not a wait on the
possibility of a call — it paces a call a bot is making. It is left long on
`human` because bots that call correctly would otherwise take every call at the
table, and a person watching should be able to beat them to one.

Against a bot's illegal draw, then, a person has only the next bot's beat to
*notice* it: nothing on screen flags the draw, so catching one means reading the
table yourself and reading it fast. A window waiting on a person stays open as
long as that person takes.

Deciding is a different matter, and it gets its own stop.

### Holding the table to name a card

`{ t: "composingCall"; open: boolean }` — sent when the accusation picker opens,
and again when it closes. While a hold stands, **no bot at the table acts**.

Naming a card is three decisions where tapping the sun used to be one, and the
figures above have no room in them for that. Stretching them would make every
bot at the table read as lag, for a wait that matters in a few seconds of a
whole game. So the clock stops instead, and only for the player who has actually
started deciding.

This is not the grace period #56 removed. That one had bots idling on the
possibility of a call, on every draw, all game long. This one hangs off an
action somebody took, and ends the moment they are done.

- **It ends** on submit, on cancel, when the window shuts for any other reason,
  on disconnect, or after `CALL_HOLD_MS` — a backstop for a tab that died with
  the picker open, not a timer anybody is meant to meet.
- **Only a viewer who could really call may hold**: not the drawer, not a
  spectator, not a caller serving a lockout.
- **One hold per window per player.** Reopening the picker reuses the deadline
  the first opening set, so it can't be worked as a stall button.
- **Nothing is broadcast.** That somebody is weighing a call is not something
  the table is told: it would be a tell about a verdict nothing else here gives
  away. Bots falling quiet is visible, and that is accepted — it says somebody
  is thinking, not that they are right.
- **Bots are all it stops.** A person taking their turn is a person playing the
  game, and their tap is not swallowed because somebody else is deciding. If a
  human does close the window while you are choosing, your picker goes with it.

A bot picks its accusation the same way a person does, from `sunnyReach` alone:
it is never told which card was legal, so a bot that can't find one says
nothing.

## Connection care

The server pings every 30s and drops sockets that stop answering. A dropped
connection marks the seat disconnected but keeps it: the game carries on and the
seat is waiting when they come back.

**Both ends have to do this, because only one of them notices a half-open
socket.** A connection that *closes* says so and the client's retry picks it
up. One that half-opens — a screen locking, wifi handing over to cellular, a
tab backgrounded for two minutes — does not: the server terminated its end a
minute ago, `terminate()` is abrupt, and nothing about it reaches a browser
that has left the network. `readyState` stays `OPEN`, every tap is written into
it and vanishes, and the board freezes on the last state that got through with
nothing on screen to say so (#183).

So the client sends `ping` every 10s and budgets 25s of total silence — measured
against *anything* arriving, not just the answer — after which it closes the
socket itself and reconnects through the ordinary `rejoin` / `watch` path. It
runs the same check the moment the tab becomes visible or the machine reports
itself online.

**It judges nothing while the tab is hidden.** A hidden tab has its timers
throttled to a minute or stopped altogether, so silence there is the browser's
doing rather than the network's, and condemning a socket on it would reconnect a
backgrounded tab in a quiet room once a minute for as long as it stayed
backgrounded — each one costing the table a seat blinking away and back and the
bots a rescheduling, to protect a board nobody is looking at. Nothing is lost by
waiting: the browser answers the server's protocol-level pings from its network
stack whether or not any script is running, so a hidden tab is never dropped for
being quiet.

The guarantee is therefore about what somebody can see: **any board on screen has
been verified inside the budget.** Coming back from a lock screen is where the
two rules meet, and it is judged the hard way — a socket nobody could vouch for
is not a connection, so a long absence usually costs one reconnect on the way
back. Being wrong that way costs a round trip. Being wrong the other way shows
somebody a board that has moved.

The figures are picked against the server's 60s, not against the network: this
end gives up first and reconnects rather than waiting to be terminated, and 25s
is two and a half pings, so one lost answer never costs anybody a reconnect.

### What survives a reconnect, and what does not

Anything the client cannot deliver waits for the next socket — **except an
`intent`, which is refused on the spot** (#152).

`rejoin`, `watch` and the lobby messages say *who you are* and *what you want
the room to be*. Neither goes stale; arriving a connection late, they still mean
what they meant. An `intent` is the opposite: it is a move against the board as
it stood when the finger came down, nothing on the wire carries that moment, and
the server judges it against whatever is true when it lands.

Most of a queue survives that because the engine refuses it — `Not your turn`,
`Doesn't match`, `Nothing to call`. **A draw does not.** It is legal or illegal
depending on what the board looked like at the instant it was taken, and the
board moves while a seat is away: a landed Sunny call rewinds the whole state,
the host can deal again. A draw that was the only move on the board when it was
tapped can arrive as a Sunny violation its player never chose to commit, and
they cannot see it happen.

The drop is **said out loud**, in the same place and register as every other
refused move. Swallowing it silently is the same failure wearing a hat: the hand
doesn't move either way, so with nothing on screen a dropped tap and a tap that
missed are one picture.

If the host disconnects, host powers move to the first connected human so the
table isn't stranded. A player returning to a room with no other connected human
becomes the host, so an empty room can always be restarted.
