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
and holds no cards. Watchers can't act, and can't call the Sunny Rule.

## Client to server

| Message | Who | Notes |
| --- | --- | --- |
| `create` | anyone | Makes a room, seats you, makes you host. |
| `join` | anyone | By room code. Refused once a game is under way — watch instead. |
| `rejoin` | seat owner | `playerId` + `token`. |
| `watch` | anyone | No seat, no cards, no actions. |
| `intent` | seated | `playCard`, `drawCard`, `chooseSuit`, `callSunny`, `surrenderCard`. |
| `start` | host | Needs at least 4 seats, at most 8; bots count. Deals, and passes the deal one seat on from last round. |
| `addBot` / `removeSeat` | host | Between games only. |
| `setBotSpeed` | host | Between games only. `human` or `lightning`; carried back to everyone on `RoomView`. |
| `setHouseRules` | host | Between games only. The three toggles; carried back to everyone on `RoomView`. |
| `composingCall` | seated | "The picker is open" / "it isn't". Holds the bots while a call is being named. Answered with nothing and broadcast to nobody. |
| `help` | seated | "I'm stuck." Echoed to the whole table as a `shout`. Rate limited to one every 2s and silently dropped above that — an error banner is no answer to somebody asking for help. |
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
- `error` — a human-readable sentence. Rejected moves are ordinary; the engine's
  refusals are written to be shown to a player as-is.
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
rules }`, between games only — the server rejects it while a game is running,
the same as bot speed.

The message is deliberately not `GameOptions`. The engine's options also carry
a deck count and a starting hand size, and those are never accepted from a
client: the server validates the three toggles against their permitted values
and constructs the full options itself. A rule that isn't named in `HouseRules`
cannot be reached from a browser.

With `sunny` off, the three challenge-window fields above are inert for
everyone — `sunnyCallable` false, `sunnyReach` null, `sunnyLockedDraws` zero —
because no challenge window is ever opened in the first place.

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

If the host disconnects, host powers move to the first connected human so the
table isn't stranded. A player returning to a room with no other connected human
becomes the host, so an empty room can always be restarted.
