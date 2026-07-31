import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";

import { ENGINE_VERSION } from "@goleta/engine";
import { config } from "./config.ts";
import { loadRooms, startPersistence } from "./persist.ts";
import { pruneRooms } from "./rooms.ts";
import { attachSockets } from "./socket.ts";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

const store = loadRooms(config.dataDir, config.roomIdleMs);
const persistence = startPersistence(store, config.dataDir);

app.get("/healthz", () => ({ ok: true, engine: ENGINE_VERSION, rooms: store.size }));

if (config.serveStatic && fs.existsSync(config.webRoot)) {
  await app.register(fastifyStatic, { root: config.webRoot });

  // Single-page app: anything that isn't a real file is a client-side route.
  app.setNotFoundHandler((request, reply) => {
    if (request.method !== "GET") return reply.status(404).send({ error: "not found" });
    return reply.sendFile("index.html");
  });
}

await app.listen({ port: config.port, host: config.host });

const detachSockets = attachSockets(app.server, { store, onChange: () => persistence.save() });

const sweep = setInterval(() => {
  const removed = pruneRooms(store, config.roomIdleMs);
  if (removed > 0) {
    app.log.info(`swept ${removed} idle room(s)`);
    persistence.save();
  }
}, config.sweepIntervalMs);
sweep.unref?.();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`${signal} — saving rooms and closing`);
  clearInterval(sweep);
  detachSockets();
  persistence.flush();
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
