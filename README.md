# goleta

An in-browser card game: **Crazy Eights, reversed.** You want to *keep* cards.
Running out eliminates you, playing is compulsory, and drawing is the reward.
The last player still holding cards wins.

Play at **https://goleta.ryankirby.net** — 4 to 8 players, no accounts, no
installs. Make a room, share the code.

**[How to play](HOW-TO-PLAY.md)** is the game in plain English, written for
somebody sitting down to their first hand. [`docs/RULES.md`](docs/RULES.md) is
what this app does, precisely, and where it departs from the original;
[`docs/ORIGINAL-RULES.md`](docs/ORIGINAL-RULES.md) is the rules as they were
first written down. The short version:

- One deck, three cards each. Match the card in play by rank or suit.
- **If you can play, you must** — so a hand full of playable cards is a hand
  that's draining.
- Stuck? Draw, up to three cards. That's a good turn.
- Eights in your hand are wild and name the next suit, which means you can never
  legally draw while holding one. An 8 turned up off the deck is just an
  ordinary 8.
- When the deck runs out the whole played pile is shuffled back in and a fresh
  card is turned up — the card everyone was matching changes.
- Draw a card when you could have played, and any other player still in can call
  the **Sunny Rule** on you — and has to name the card you should have played.
  Get it right and you make that play anyway, sacrifice a second card as well,
  and the card you reached for is turned up as the new card in play. Get it
  wrong and nobody loses anything; you just can't call again until the table has
  reached for the deck three more times.

Every hand is face up, all game — spotting the play someone skipped is the
point, and the app won't spot it for you.

## Status

**Live, and five milestones deep.** Online multiplayer with no-login seats that
survive a reload or a redeploy; bots to fill a table; **IRL mode** for a table
of people in the same room, with an optional shared screen showing the board
that can be reordered to match where everybody is actually sitting; autopilot
for a seat that has stepped away; and a pass over legibility, placement and
large print.

Every game real tables play is written to an append-only record on disk, which
is what any question about how the game is actually played gets answered from.

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
