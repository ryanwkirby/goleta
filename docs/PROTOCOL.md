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

### What it does send, and used not to

Three fields describe the challenge window: `sunnyCallable`, `sunnyTargetId`,
and `sunnyWouldLand`.

The first two are old. `sunnyCallable` is true after **any** draw by somebody
else, honest or not — the call is always available, so its presence tells you
nothing.

`sunnyWouldLand` is the answer, and sending it at all reverses a decision this
document used to state the other way round. It is the tell behind the sun
icon's glow, and the balance is in how the UI spends it: the glow takes ten
seconds to go from barely perceptible to unmissable, so a player watching the
table still gets there before one who isn't. It goes only to viewers who could
call this instant — never to the drawer, who is not told they've been caught,
and never to a spectator, who has no call to make.

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

One consequence, taken deliberately: the sun icon's ten-second ramp usually will
not finish before a bot's ordinary move closes the window. Catching a bot's
illegal draw means seeing it yourself, inside the next bot's beat. The ramp is
unchanged and still runs in full wherever the window stays open that long, which
is any window waiting on a person.

## Connection care

The server pings every 30s and drops sockets that stop answering. A dropped
connection marks the seat disconnected but keeps it: the game carries on and the
seat is waiting when they come back.

If the host disconnects, host powers move to the first connected human so the
table isn't stranded. A player returning to a room with no other connected human
becomes the host, so an empty room can always be restarted.
