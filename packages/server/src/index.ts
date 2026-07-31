import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";

import { ENGINE_VERSION } from "@goleta/engine";
import { config } from "./config.ts";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

app.get("/healthz", () => ({ ok: true, engine: ENGINE_VERSION }));

if (config.serveStatic && fs.existsSync(config.webRoot)) {
  await app.register(fastifyStatic, { root: config.webRoot });

  // Single-page app: anything that isn't a real file is a client-side route.
  app.setNotFoundHandler((request, reply) => {
    if (request.method !== "GET") return reply.status(404).send({ error: "not found" });
    return reply.sendFile("index.html");
  });
}

await app.listen({ port: config.port, host: config.host });
