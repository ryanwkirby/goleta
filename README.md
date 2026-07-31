# goleta

An in-browser card game: **Crazy Eights, reversed.** You want to *keep* cards.
Running out eliminates you, playing is compulsory, and drawing is the reward.
The last player still holding cards wins.

Play at **https://goleta.ryankirby.net** — 3 to 6 players, no accounts, no
installs. Make a room, share the code.

The full rules are in [`docs/RULES.md`](docs/RULES.md). The short version:

- Two decks. Match the top card by rank or suit.
- **If you can play, you must** — so a hand full of playable cards is a hand
  that's draining.
- Stuck? Draw, up to three cards. That's a good turn.
- Eights are wild and name the next suit, which means you can never legally draw
  while holding one.
- Draw a card when you could have played, and anyone can call the **Sunny
  Rule** on you. Get it right and they lose the drawn card, a punishment card,
  and still have to make the play. Get it wrong and *you* lose a card.

Tables start with every hand face up while people learn, and the host flips them
down when the table's ready.

## Status

**Milestone 1 — online multiplayer is done and live.** Rooms, no-login seats
that survive a reload or a redeploy, face-up and hidden hands, bots to fill a
table, and the Sunny Rule, on desktop and phone.

**Milestone 2** is next: IRL mode for a table of people in the same room, with
an optional shared screen showing the board.

## Development

npm workspaces monorepo, one process, one container.

| Package | What it is |
| --- | --- |
| `packages/engine` | The rules. Pure TypeScript, no I/O, seeded RNG, imported by both the server and the browser so they can't disagree. |
| `packages/server` | Fastify + `ws`. The authoritative referee — it's the only thing that knows every hand. |
| `packages/web` | React + Vite + TypeScript + Tailwind. |

```bash
npm install
npm run dev     # server on :8063, Vite dev server proxied to it
npm test        # engine rules + seeded full-game simulations
npm run lint
npm run build
```

Deployment (Docker on the Mac mini, Cloudflare Tunnel) is documented in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Conventions for AI coding agents
working in this repo are in [`AGENTS.md`](AGENTS.md).
