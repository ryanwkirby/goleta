# Deployment

goleta runs as a single Node container on the Mac mini's Docker Desktop, on the
same setup as the other services in `~/git` (see `sdge-rate-explorer` for the
sibling pattern). One process serves the API, the WebSocket and the built web
bundle, so they share an origin and the tunnel needs only one ingress rule.

## Local / manual deploy

```bash
docker compose up -d --build
```

Serves on `http://localhost:8063`. No secrets and no `.env` — there is nothing
to configure and no accounts to store.

## Cloudflare Tunnel

Public hostname: **https://goleta.ryankirby.net**

The tunnel config lives outside this repo, at `~/.cloudflared/config.yml` on the
host, shared across every service on the tunnel. This app's ingress rule sits in
the list alphabetically, between `flights` and `kcrw`:

```yaml
- hostname: goleta.ryankirby.net
  service: http://host.docker.internal:8063
```

DNS was routed with `cloudflared tunnel route dns mac-mini-tunnel
goleta.ryankirby.net`, and the `cloudflared-tunnel` container restarted to pick
up the new rule. Nothing in this repo needs changing to add or move the public
hostname — that's host-level config.

**WebSockets need no special configuration.** Cloudflare Tunnel proxies the
upgrade as it stands. If the game ever loads but never connects, check that the
page is being served over `https` — the client picks `wss:` from the page
protocol, and a mixed `http` page would try `ws:` and be blocked.

## Redeploying after a change

```bash
git pull
docker compose up -d --build
```

**A redeploy is survivable by design.** Live rooms are snapshotted to the
`goleta-data` volume and restored at boot, so a game in progress comes back
rather than evaporating; players' browsers reconnect and reclaim their seats
automatically. Two things follow from that:

- Don't `docker compose down -v`. That deletes the volume, and with it any game
  that was in progress.
- If you change the persisted shape, version it and handle the old one. A
  version mismatch is treated as "start clean", which is honest but loses games.

There's no CI auto-deploy runner for this repo, matching the other small apps
here — self-hosted runners are registered per repo and it isn't worth one for
this. GitHub Actions runs lint, typecheck, tests and a docker build on
`ubuntu-latest`; deploying is the manual step above.

## Checking it worked

```bash
node scripts/check-deploy.ts                       # the public hostname
node scripts/check-deploy.ts http://localhost:8063 # the container directly
```

It checks `/healthz`, opens a real WebSocket, makes a room and reads the state
back. **Don't try to check the upgrade with `curl`** against the public
hostname: curl isn't a WebSocket client, so Cloudflare answers it with the
single-page app and a `200`, which looks exactly like a broken upgrade. Against
the container directly curl does return `101`, which is what makes the
discrepancy so convincing and so wrong.

Then open the site on a phone and a laptop, make a room on one, join from the
other, add a bot, and play a hand.
