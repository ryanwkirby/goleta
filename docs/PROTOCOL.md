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
| `ping` | anyone | Answered with `pong`. |

**The `playerId` inside an `intent` is ignored.** The server stamps the seat the
connection actually belongs to before the intent reaches the engine, so a client
can only ever act as itself. There's a test that tries it the other way.

## Server to client

- `welcome` — `playerId` and `token` for this browser (both null for a watcher).
- `state` — the room, your view of the game, and the events that just happened.
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

| | ordinary move | calling Sunny | grace before closing a challenge window |
| --- | --- | --- | --- |
| `human` (default) | 5s | 5s | 12s |
| `lightning` | 800ms | 1.2s | 3.5s |

The grace column is the one that matters: when a challenge window is open, a bot
whose move would close it waits instead. Without that, a bot in the next seat
would shut the window before any human could reach for it and the Sunny Rule
would only ever work between people. On `human` it also outlasts the ten seconds
the sun icon takes to reach full glow, so the tell finishes arriving before the
window can close on it — on `lightning` it doesn't, which is the trade you make
for the pace.

## Connection care

The server pings every 30s and drops sockets that stop answering. A dropped
connection marks the seat disconnected but keeps it: the game carries on and the
seat is waiting when they come back.

If the host disconnects, host powers move to the first connected human so the
table isn't stranded. A player returning to a room with no other connected human
becomes the host, so an empty room can always be restarted.
