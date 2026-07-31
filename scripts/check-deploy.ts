/**
 * Proves a deployment actually works, rather than merely answering.
 *
 * `curl` against the public hostname is not a WebSocket client, and Cloudflare
 * will hand it the single-page app with a 200 instead of a 101 — which looks
 * exactly like a broken upgrade. The only honest check is to open a real
 * socket and play a little of a game through it.
 *
 *   node scripts/check-deploy.ts                       # goleta.ryankirby.net
 *   node scripts/check-deploy.ts http://localhost:8063
 */

import { WebSocket } from "ws";

import type { ClientMessage, ServerMessage } from "@goleta/engine";

const origin = process.argv[2] ?? "https://goleta.ryankirby.net";
const httpUrl = new URL(origin);
const wsUrl = new URL("/ws", origin);
wsUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";

const fail = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const health = await fetch(new URL("/healthz", origin)).catch(() => null);
if (!health?.ok) fail(`no healthy response from ${new URL("/healthz", origin)}`);
console.log(`✓ ${new URL("/healthz", origin)} — ${await health.text()}`);

const socket = new WebSocket(wsUrl);
const send = (message: ClientMessage): void => socket.send(JSON.stringify(message));

const timeout = setTimeout(() => fail("the socket never finished a round trip (10s)"), 10_000);

socket.on("unexpected-response", (_request, response) =>
  fail(
    `the upgrade was refused with ${response.statusCode}. ` +
      `A 200 here usually means something answered as plain HTTP instead of upgrading.`,
  ),
);
socket.on("error", (error) => fail(`socket error: ${error.message}`));

socket.on("open", () => {
  console.log(`✓ ${wsUrl} — upgraded`);
  send({ t: "create", name: "Deploy check" });
});

socket.on("message", (raw) => {
  const message = JSON.parse(String(raw)) as ServerMessage;
  if (message.t === "error") fail(`server said: ${message.message}`);
  if (message.t !== "state") return;

  console.log(`✓ made room ${message.room.code} and got a redacted state back`);
  clearTimeout(timeout);
  socket.close();
  console.log("\nDeployment is live. The room will expire on its own.");
  process.exit(0);
});
