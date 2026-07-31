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
| `intent` | seated | `playCard`, `drawCard`, `chooseSuit`, `callSunny`, `disposeCard`. |
| `start` | host | Needs at least 3 seats; bots count. |
| `setHandsVisible` | host | Puts hands up or down, at any time. |
| `setStartingHandSize` | host | 3 to 10, between games. |
| `addBot` / `removeSeat` | host | Between games only. |
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

- Another player's hand, when the table is playing with hands down.
- Anything about the challenge window beyond `sunnyCallable` and
  `sunnyTargetId`. In particular, never whether a draw was legal.

That second one shapes the protocol more than it looks. `sunnyCallable` is true
after **any** draw by somebody else — offering the call only when it would
succeed would leak the answer just as surely as sending a flag called
`wasIllegal`. Two draws, one honest and one not, produce byte-identical views.

## Bots

Bots live on the server and act on a timer. Ordinary moves are paced at around
800ms so the table can follow what happened.

The exception matters: when a challenge window is open, a bot that would close
it by acting waits considerably longer (3.5s). Without that, a bot sitting in
the next seat would shut the window before any human could reach the button, and
the Sunny Rule would only ever work between people.

## Connection care

The server pings every 30s and drops sockets that stop answering. A dropped
connection marks the seat disconnected but keeps it: the game carries on and the
seat is waiting when they come back.

If the host disconnects, host powers move to the first connected human so the
table isn't stranded. A player returning to a room with no other connected human
becomes the host, so an empty room can always be restarted.
